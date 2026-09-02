#!/usr/bin/env node
// One-command wrapper around the project's standard verification sequence.
//
// Collapses four separate model/tool round trips (test, lint, typecheck, web
// export) into one, without hiding anything: on failure the failing command's
// output is printed and the exit status is non-zero, and the complete log of
// every step is always written to a file whose path is reported.
//
// Usage:
//   node .claude/scripts/verify.mjs                # full sequence
//   node .claude/scripts/verify.mjs --skip-export  # omit the web export
//   node .claude/scripts/verify.mjs --only lint    # one step (repeatable)
//   node .claude/scripts/verify.mjs --test-file path/to/file.test.ts
//   node .claude/scripts/verify.mjs --keep-going   # run every step even after a failure
//   node .claude/scripts/verify.mjs --json         # machine-readable result
//
// Run it with a generous tool timeout: the full sequence can exceed a tool's
// default timeout on slower machines.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const FAILURE_TAIL_LINES = 120;

export const STEPS = [
  { name: 'test', argv: ['yarn', 'test', '--runInBand'] },
  { name: 'lint', argv: ['yarn', 'lint'] },
  { name: 'typecheck', argv: ['yarn', 'tsc', '--noEmit'] },
  { name: 'web-export', argv: ['yarn', 'expo', 'export', '--platform', 'web', '--output-dir', null], optional: true },
];

export function parseArgs(argv) {
  const options = { skipExport: false, only: [], testFiles: [], keepGoing: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--skip-export') options.skipExport = true;
    else if (arg === '--keep-going') options.keepGoing = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--only') {
      const value = argv[++index];
      if (!value) throw new Error('--only requires a step name');
      options.only.push(value);
    } else if (arg === '--test-file') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--test-file requires a test file path');
      options.testFiles.push(value);
    } else throw new Error(`unrecognized argument: ${arg}`);
  }
  const known = new Set(STEPS.map((step) => step.name));
  for (const name of options.only) {
    if (!known.has(name)) throw new Error(`unknown step ${JSON.stringify(name)}; expected one of ${[...known].join(', ')}`);
  }
  if (options.testFiles.length > 0) {
    if (options.only.length === 0) options.only.push('test');
    else if (!options.only.includes('test')) throw new Error('--test-file can only be combined with --only test');
  }
  return options;
}

/** Which steps a given invocation runs, in order. */
export function planSteps(options, steps = STEPS) {
  return steps.filter((step) => {
    if (options.only.length > 0) return options.only.includes(step.name);
    if (options.skipExport && step.optional) return false;
    return true;
  });
}

export function buildStepArgv(step, options, exportDir) {
  const argv = step.argv.map((token) => (token === null ? exportDir : token));
  if (step.name === 'test' && options.testFiles.length > 0) {
    argv.push('--runTestsByPath', ...options.testFiles);
  }
  return argv;
}

function tail(text, lines) {
  const split = text.split('\n');
  if (split.length <= lines) return text;
  return `…(${split.length - lines} earlier lines in the log file)\n${split.slice(-lines).join('\n')}`;
}

function emitJson(result) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ...result })}\n`);
}

export function formatFailureResult(result) {
  return `\n--- \`${result.command}\` (exit ${result.code}) ---\n${result.outputTail}\n`;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (process.argv.includes('--json')) emitJson({ status: 'invalid-arguments', error: error.message });
    else process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }

  const cwd = process.cwd();
  const exportDir = path.join(os.tmpdir(), `daily-dama-web-export-${process.pid}`);
  const logPath = path.join(os.tmpdir(), `daily-dama-verify-${process.pid}.log`);
  const planned = planSteps(options);
  const results = [];
  let failure = null;

  for (const step of planned) {
    const argv = buildStepArgv(step, options, exportDir);
    const started = Date.now();
    const proc = spawnSync(argv[0], argv.slice(1), {
      cwd,
      encoding: 'utf8',
      shell: false,
      maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, CI: '1' },
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
    const code = proc.status === null ? 1 : proc.status;
    results.push({
      name: step.name,
      status: code === 0 ? 'passed' : 'failed',
      code,
      exitCode: code,
      seconds,
      durationMs: Date.now() - started,
      command: argv.join(' '),
      ...(code === 0 ? {} : { outputTail: tail(output.trim(), FAILURE_TAIL_LINES) }),
    });
    fs.appendFileSync(logPath, `\n===== ${step.name}: ${argv.join(' ')} (exit ${code}, ${seconds}s) =====\n${output}`);
    if (code !== 0) {
      failure = failure ?? { name: step.name, code };
      if (!options.keepGoing) break;
    }
  }

  if (options.json) {
    if (failure) {
      emitJson({
        status: 'failed',
        firstFailedStep: failure.name,
        options: { skipExport: options.skipExport, only: options.only, testFiles: options.testFiles, keepGoing: options.keepGoing },
        steps: results,
        logPath,
      });
      process.exit(failure.code || 1);
    }
    emitJson({
      status: 'passed',
      options: { skipExport: options.skipExport, only: options.only, testFiles: options.testFiles, keepGoing: options.keepGoing },
      steps: results,
      skippedSteps: STEPS.filter((step) => !planned.includes(step)).map((step) => step.name),
      logPath,
    });
    fs.rmSync(exportDir, { recursive: true, force: true });
    process.exit(0);
  }

  for (const result of results) {
    process.stdout.write(`${result.code === 0 ? 'PASS' : 'FAIL'}  ${result.name.padEnd(11)}${result.seconds}s\n`);
  }
  if (failure) {
    for (const result of results.filter((entry) => entry.code !== 0)) {
      process.stdout.write(formatFailureResult(result));
    }
    process.stdout.write(`\nVERIFY: FAIL at ${failure.name} — full log: ${logPath}\n`);
    process.exit(failure.code || 1);
  }
  const skipped = STEPS.length - planned.length;
  process.stdout.write(
    `\nVERIFY: PASS (${planned.length}/${STEPS.length} steps${skipped ? `, ${skipped} skipped` : ''}) — log: ${logPath}\n`,
  );
  fs.rmSync(exportDir, { recursive: true, force: true });
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
