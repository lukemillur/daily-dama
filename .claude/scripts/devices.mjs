#!/usr/bin/env node
// Simulator/emulator lifecycle for agent runs.
//
// Booted iOS Simulators cost ~6–7 GB each and Android Emulators several more,
// and nothing used to shut them down: devices booted by one run sat idle for
// days while later runs booted more. Two rules fix that:
//
//   1. At most one booted device per platform. Switching to a different device
//      (e.g. a screen-size check) shuts the previous one down first.
//   2. A run releases only what it started. The orchestrator records which
//      devices were already booted before its first ticket (`snapshot`), keeps
//      reusing devices across tickets, and at the end of the run shuts down
//      everything not in that snapshot (`release`). Devices another session or
//      the owner had running stay up.
//
// Usage:
//   node .claude/scripts/devices.mjs list
//   node .claude/scripts/devices.mjs snapshot
//   node .claude/scripts/devices.mjs use-ios --udid <udid>
//   node .claude/scripts/devices.mjs use-android --avd <name>
//   node .claude/scripts/devices.mjs release --keep <udid|serial> [--keep …]
//   node .claude/scripts/devices.mjs release --keep-none
//   …add --dry-run to report decisions without changing anything.
//
// Prints one JSON object on stdout. Exit 2 on bad arguments, 1 when a requested
// boot or shutdown failed, 0 otherwise.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRunner } from './lib/exec.mjs';

const COMMANDS = new Set(['list', 'snapshot', 'use-ios', 'use-android', 'release']);

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) throw new Error(`expected one of: ${[...COMMANDS].join(', ')}`);
  const options = { command, udid: null, avd: null, keep: [], keepNone: false, dryRun: false };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--udid') options.udid = rest[++index];
    else if (arg === '--avd') options.avd = rest[++index];
    else if (arg === '--keep') options.keep.push(rest[++index]);
    else if (arg === '--keep-none') options.keepNone = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else throw new Error(`unrecognized argument: ${arg}`);
  }
  if (command === 'use-ios' && !options.udid) throw new Error('use-ios requires --udid');
  if (command === 'use-android' && !options.avd) throw new Error('use-android requires --avd');
  // An empty keep list would shut down every device on the machine, so the
  // caller must say so explicitly rather than reach it by forgetting the list.
  if (command === 'release' && options.keep.length === 0 && !options.keepNone) {
    throw new Error('release requires --keep <id> for each pre-existing device, or --keep-none');
  }
  if (options.keepNone && options.keep.length > 0) throw new Error('--keep-none cannot be combined with --keep');
  return options;
}

export function resolveAdb({ env = process.env, exists = fs.existsSync } = {}) {
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT ?? path.join(os.homedir(), 'Library', 'Android', 'sdk');
  const candidate = path.join(sdk, 'platform-tools', 'adb');
  return exists(candidate) ? candidate : 'adb';
}

/** Booted simulators of every runtime; `ios` marks the ones the per-platform cap applies to. */
export function listSimulators({ run }) {
  const result = run(['xcrun', 'simctl', 'list', 'devices', 'booted', '-j'], { allowFailure: true });
  if (result.code !== 0) return { available: false, devices: [], detail: result.stderr.trim() };
  const runtimes = JSON.parse(result.stdout).devices ?? {};
  const devices = [];
  for (const [runtime, entries] of Object.entries(runtimes)) {
    for (const entry of entries) {
      if (entry.state !== 'Booted') continue;
      devices.push({ id: entry.udid, name: entry.name, runtime: runtime.split('.').pop(), ios: /\.iOS-/.test(runtime) });
    }
  }
  return { available: true, devices };
}

/** Running emulators (physical devices are never touched) with their AVD names. */
export function listEmulators({ run, adb }) {
  const result = run([adb, 'devices'], { allowFailure: true });
  if (result.code !== 0) return { available: false, devices: [], detail: result.stderr.trim() };
  const serials = result.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => /^emulator-\d+$/.test(serial ?? '') && state === 'device')
    .map(([serial]) => serial);
  const devices = serials.map((serial) => {
    const name = run([adb, '-s', serial, 'emu', 'avd', 'name'], { allowFailure: true });
    return { id: serial, avd: name.code === 0 ? name.stdout.split('\n')[0].trim() : null };
  });
  return { available: true, devices };
}

function shutdownSimulator({ run, device, dryRun }) {
  if (dryRun) return { ...device, action: 'would-shutdown' };
  const result = run(['xcrun', 'simctl', 'shutdown', device.id], { allowFailure: true });
  return result.code === 0
    ? { ...device, action: 'shutdown' }
    : { ...device, action: 'failed', detail: result.stderr.trim() };
}

function killEmulator({ run, adb, device, dryRun }) {
  if (dryRun) return { ...device, action: 'would-kill' };
  const result = run([adb, '-s', device.id, 'emu', 'kill'], { allowFailure: true });
  return result.code === 0
    ? { ...device, action: 'killed' }
    : { ...device, action: 'failed', detail: result.stderr.trim() };
}

export function list({ run, adb }) {
  const simulators = listSimulators({ run });
  const emulators = listEmulators({ run, adb });
  return { status: 'listed', simulators, emulators };
}

/** The ids to pass back to `release --keep`. */
export function snapshot({ run, adb }) {
  const { simulators, emulators } = list({ run, adb });
  const keep = [...simulators.devices, ...emulators.devices].map((device) => device.id);
  return { status: 'snapshot', keep, simulators: simulators.devices, emulators: emulators.devices };
}

export function useIos({ run, udid, dryRun }) {
  const simulators = listSimulators({ run });
  if (!simulators.available) return { status: 'failed', detail: simulators.detail, closed: [] };
  const closed = simulators.devices
    .filter((device) => device.ios && device.id !== udid)
    .map((device) => shutdownSimulator({ run, device, dryRun }));
  const alreadyBooted = simulators.devices.some((device) => device.id === udid);
  let boot = 'already-booted';
  let detail;
  if (!alreadyBooted) {
    if (dryRun) boot = 'would-boot';
    else {
      const result = run(['xcrun', 'simctl', 'boot', udid], { allowFailure: true });
      boot = result.code === 0 ? 'booted' : 'failed';
      if (result.code !== 0) detail = result.stderr.trim();
    }
  }
  const failed = boot === 'failed' || closed.some((entry) => entry.action === 'failed');
  return { status: failed ? 'failed' : 'ready', udid, boot, closed, ...(detail ? { detail } : {}) };
}

// The emulator binary must outlive this process, so starting it is left to the
// caller as a backgrounded command; this enforces the cap and says whether a
// start is still needed.
export function useAndroid({ run, adb, avd, dryRun }) {
  const emulators = listEmulators({ run, adb });
  if (!emulators.available) return { status: 'failed', detail: emulators.detail, closed: [] };
  const target = emulators.devices.find((device) => device.avd === avd);
  const closed = emulators.devices
    .filter((device) => device !== target)
    .map((device) => killEmulator({ run, adb, device, dryRun }));
  const failed = closed.some((entry) => entry.action === 'failed');
  if (target) return { status: failed ? 'failed' : 'ready', avd, serial: target.id, closed };
  const emulatorBin = path.join(path.dirname(path.dirname(adb)), 'emulator', 'emulator');
  return {
    status: failed ? 'failed' : 'start-required',
    avd,
    closed,
    startCommand: `${adb === 'adb' ? 'emulator' : emulatorBin} -avd ${avd}`,
  };
}

export function release({ run, adb, keep, dryRun }) {
  const kept = new Set(keep);
  const simulators = listSimulators({ run });
  const emulators = listEmulators({ run, adb });
  const closed = [
    ...simulators.devices.filter((device) => !kept.has(device.id)).map((device) => shutdownSimulator({ run, device, dryRun })),
    ...emulators.devices.filter((device) => !kept.has(device.id)).map((device) => killEmulator({ run, adb, device, dryRun })),
  ];
  const left = [...simulators.devices, ...emulators.devices].filter((device) => kept.has(device.id));
  const failed = closed.filter((entry) => entry.action === 'failed');
  return { status: failed.length === 0 ? 'released' : 'failed', dryRun, closed, left };
}

export function execute({ run, adb, options }) {
  switch (options.command) {
    case 'list':
      return list({ run, adb });
    case 'snapshot':
      return snapshot({ run, adb });
    case 'use-ios':
      return useIos({ run, udid: options.udid, dryRun: options.dryRun });
    case 'use-android':
      return useAndroid({ run, adb, avd: options.avd, dryRun: options.dryRun });
    case 'release':
      return release({ run, adb, keep: options.keep, dryRun: options.dryRun });
    default:
      throw new Error(`unhandled command ${options.command}`);
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  const result = execute({ run: createRunner(), adb: resolveAdb(), options });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === 'failed' ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
