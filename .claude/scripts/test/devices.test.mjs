import test from 'node:test';
import assert from 'node:assert/strict';

import { createFakeRunner } from '../lib/exec.mjs';
import { listEmulators, parseArgs, release, resolveAdb, snapshot, useAndroid, useIos } from '../devices.mjs';

const ADB = '/sdk/platform-tools/adb';

const simctlJson = (devices) =>
  JSON.stringify({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-27-2': devices.filter((d) => d.ios !== false),
      'com.apple.CoreSimulator.SimRuntime.watchOS-12-0': devices.filter((d) => d.ios === false),
    },
  });

const sim = (udid, name, extra = {}) => ({ udid, name, state: 'Booted', ...extra });

function fakeHost({ sims = [], emulators = {}, failShutdown = false, failBoot = false } = {}) {
  const adbLines = ['List of devices attached', ...Object.keys(emulators).map((s) => `${s}\tdevice`), 'R5CT1234\tdevice', ''];
  return createFakeRunner([
    [/simctl list devices booted -j/, { stdout: simctlJson(sims) }],
    [/simctl shutdown/, failShutdown ? { code: 164, stderr: 'Unable to shutdown device' } : {}],
    [/simctl boot/, failBoot ? { code: 149, stderr: 'Invalid device' } : {}],
    [`${ADB} devices`, { stdout: adbLines.join('\n') }],
    ...Object.entries(emulators).map(([serial, avd]) => [`${ADB} -s ${serial} emu avd name`, { stdout: `${avd}\nOK\n` }]),
    [/emu kill/, {}],
  ]);
}

const executed = (run, pattern) => run.calls.map((argv) => argv.join(' ')).filter((line) => pattern.test(line));

test('release refuses an implicit empty keep list', () => {
  assert.throws(() => parseArgs(['release']), /--keep-none/);
  assert.equal(parseArgs(['release', '--keep-none']).keepNone, true);
  assert.deepEqual(parseArgs(['release', '--keep', 'A', '--keep', 'B']).keep, ['A', 'B']);
  assert.throws(() => parseArgs(['release', '--keep', 'A', '--keep-none']), /cannot be combined/);
  assert.throws(() => parseArgs(['use-ios']), /--udid/);
  assert.throws(() => parseArgs(['boot']), /expected one of/);
});

test('snapshot records every booted simulator and emulator, but never physical devices', () => {
  const run = fakeHost({ sims: [sim('IOS-1', 'iPhone 17e'), sim('WATCH-1', 'Watch', { ios: false })], emulators: { 'emulator-5554': 'Pixel_9' } });
  const result = snapshot({ run, adb: ADB });
  assert.deepEqual(result.keep, ['IOS-1', 'WATCH-1', 'emulator-5554']);
});

test('use-ios shuts down other booted iOS simulators before booting the target', () => {
  const run = fakeHost({ sims: [sim('OLD', 'iPhone 17e'), sim('WATCH-1', 'Watch', { ios: false })] });
  const result = useIos({ run, udid: 'NEW', dryRun: false });
  assert.equal(result.status, 'ready');
  assert.equal(result.boot, 'booted');
  assert.deepEqual(result.closed.map((d) => d.id), ['OLD']);
  // The cap is per platform: a paired watch simulator is not an iOS device.
  assert.deepEqual(executed(run, /simctl (shutdown|boot)/), ['xcrun simctl shutdown OLD', 'xcrun simctl boot NEW']);
});

test('use-ios reuses an already-booted target without rebooting it', () => {
  const run = fakeHost({ sims: [sim('SAME', 'iPhone 18 Pro Max')] });
  const result = useIos({ run, udid: 'SAME', dryRun: false });
  assert.equal(result.boot, 'already-booted');
  assert.deepEqual(executed(run, /simctl (shutdown|boot)/), []);
});

test('use-ios reports a failed boot', () => {
  const run = fakeHost({ failBoot: true });
  const result = useIos({ run, udid: 'BAD', dryRun: false });
  assert.equal(result.status, 'failed');
  assert.match(result.detail, /Invalid device/);
});

test('use-ios --dry-run changes nothing', () => {
  const run = fakeHost({ sims: [sim('OLD', 'iPhone 17e')] });
  const result = useIos({ run, udid: 'NEW', dryRun: true });
  assert.equal(result.boot, 'would-boot');
  assert.equal(result.closed[0].action, 'would-shutdown');
  assert.deepEqual(executed(run, /simctl (shutdown|boot)/), []);
});

test('use-android kills other emulators and keeps a running target', () => {
  const run = fakeHost({ emulators: { 'emulator-5554': 'Pixel_9', 'emulator-5556': 'Small_Phone' } });
  const result = useAndroid({ run, adb: ADB, avd: 'Small_Phone', dryRun: false });
  assert.equal(result.status, 'ready');
  assert.equal(result.serial, 'emulator-5556');
  assert.deepEqual(executed(run, /emu kill/), [`${ADB} -s emulator-5554 emu kill`]);
});

test('use-android returns a start command when the target is not running', () => {
  const run = fakeHost({ emulators: { 'emulator-5554': 'Pixel_9' } });
  const result = useAndroid({ run, adb: ADB, avd: 'Small_Phone', dryRun: false });
  assert.equal(result.status, 'start-required');
  assert.equal(result.startCommand, '/sdk/emulator/emulator -avd Small_Phone');
  assert.equal(result.closed[0].id, 'emulator-5554');
});

test('physical Android devices are never listed or killed', () => {
  const run = fakeHost({ emulators: {} });
  assert.deepEqual(listEmulators({ run, adb: ADB }).devices, []);
  assert.deepEqual(executed(run, /emu kill/), []);
});

test('release closes only devices started after the snapshot', () => {
  const run = fakeHost({
    sims: [sim('OWNER', 'iPhone 17e'), sim('RUN', 'iPhone 18 Pro Max')],
    emulators: { 'emulator-5554': 'Pixel_9' },
  });
  const result = release({ run, adb: ADB, keep: ['OWNER'], dryRun: false });
  assert.equal(result.status, 'released');
  assert.deepEqual(result.closed.map((d) => d.id), ['RUN', 'emulator-5554']);
  assert.deepEqual(result.left.map((d) => d.id), ['OWNER']);
});

test('release reports a failed shutdown instead of claiming success', () => {
  const run = fakeHost({ sims: [sim('RUN', 'iPhone 17e')], failShutdown: true });
  const result = release({ run, adb: ADB, keep: [], dryRun: false });
  assert.equal(result.status, 'failed');
  assert.equal(result.closed[0].action, 'failed');
});

test('missing Android tooling is reported as unavailable, not as zero devices failing', () => {
  const run = createFakeRunner([
    [/simctl list devices booted -j/, { stdout: simctlJson([]) }],
    [/devices$/, { code: 1, stderr: 'spawn adb ENOENT' }],
  ]);
  const result = release({ run, adb: 'adb', keep: [], dryRun: false });
  assert.equal(result.status, 'released');
  assert.deepEqual(result.closed, []);
});

test('resolveAdb prefers the SDK binary and falls back to PATH', () => {
  assert.equal(resolveAdb({ env: { ANDROID_HOME: '/sdk' }, exists: () => true }), '/sdk/platform-tools/adb');
  assert.equal(resolveAdb({ env: { ANDROID_HOME: '/sdk' }, exists: () => false }), 'adb');
});
