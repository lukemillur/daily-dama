#!/usr/bin/env node
// Keep successful Node test runs out of agent context while preserving the
// complete native reporter output on failure.

import { spawnSync } from 'node:child_process';

const testPatterns = process.argv.slice(2);
if (testPatterns.length === 0) {
  process.stderr.write('usage: node .claude/scripts/terse-node-test.mjs <test-pattern> [...]\n');
  process.exit(2);
}

const started = Date.now();
const proc = spawnSync(process.execPath, ['--test', ...testPatterns], {
  encoding: 'utf8',
  shell: false,
  maxBuffer: 128 * 1024 * 1024,
  env: { ...process.env, CI: '1' },
});
const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
const code = proc.status === null ? 1 : proc.status;
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (code === 0) {
  const count = output.match(/(?:^|\n)\D*tests\s+(\d+)/)?.[1];
  process.stdout.write(`NODE TESTS: PASS${count ? ` (${count} tests` : ''}, ${seconds}s)\n`);
  process.exit(0);
}

process.stdout.write(output);
process.stdout.write(`\nNODE TESTS: FAIL (exit ${code}, ${seconds}s)\n`);
process.exit(code || 1);
