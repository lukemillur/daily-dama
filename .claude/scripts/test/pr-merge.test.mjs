import test from 'node:test';
import assert from 'node:assert/strict';

import { createFakeRunner } from '../lib/exec.mjs';
import { mergePullRequest, parseArgs, repositorySelectorFromPr } from '../pr-merge.mjs';

const PR = 'https://github.com/example/daily-dama/pull/244';
const OPEN = JSON.stringify({ state: 'OPEN', mergedAt: null, mergeCommit: null, url: PR });
const MERGED = JSON.stringify({
  state: 'MERGED',
  mergedAt: '2026-08-28T19:00:13Z',
  mergeCommit: { oid: 'c95b5b9' },
  url: PR,
});

test('derives an explicit repository selector from a pull-request URL', () => {
  assert.equal(repositorySelectorFromPr(PR), 'github.com/example/daily-dama');
  assert.throws(() => repositorySelectorFromPr('244'), /full pull-request URL/);
  assert.throws(() => repositorySelectorFromPr('https://github.com/example/daily-dama/issues/244'), /must look like/);
  assert.deepEqual(parseArgs(['--pr', PR]), { pr: PR });
  assert.throws(() => parseArgs([]), /usage:/);
});

test('merge uses remote repository context so a locally checked-out development branch is irrelevant', () => {
  let views = 0;
  const run = createFakeRunner([
    [/gh pr view/, () => ({ stdout: views++ === 0 ? OPEN : MERGED })],
    [/gh pr merge/, { stdout: 'merged\n' }],
  ]);
  const result = mergePullRequest({ run, pr: PR });

  assert.equal(result.status, 'merged');
  assert.equal(result.attempted, true);
  assert.deepEqual(run.calls.find((argv) => argv[2] === 'merge'), [
    'gh',
    'pr',
    'merge',
    PR,
    '--repo',
    'github.com/example/daily-dama',
    '--squash',
    '--delete-branch',
  ]);
  assert.equal(run.calls.some((argv) => argv[0] === 'git'), false);
});

test('a confirmed remote merge wins over a non-zero local merge command result', () => {
  let views = 0;
  const run = createFakeRunner([
    [/gh pr view/, () => ({ stdout: views++ === 0 ? OPEN : MERGED })],
    [/gh pr merge/, { code: 1, stderr: "fatal: 'development' is already checked out\n" }],
  ]);
  const result = mergePullRequest({ run, pr: PR });
  assert.equal(result.status, 'merged');
  assert.equal(result.commandExitCode, 1);
  assert.match(result.commandOutput, /development.*already checked out/);
});

test('resume is idempotent when the PR is already merged', () => {
  const run = createFakeRunner([[/gh pr view/, { stdout: MERGED }]]);
  const result = mergePullRequest({ run, pr: PR });
  assert.equal(result.status, 'merged');
  assert.equal(result.attempted, false);
  assert.equal(result.commandExitCode, null);
  assert.equal(run.calls.some((argv) => argv[2] === 'merge'), false);
});

test('an unavailable preflight never performs a merge attempt', () => {
  const run = createFakeRunner([[/gh pr view/, { code: 1, stderr: 'network unavailable' }]]);
  const result = mergePullRequest({ run, pr: PR });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.phase, 'preflight');
  assert.equal(result.attempted, false);
  assert.equal(result.commandExitCode, null);
  assert.equal(run.calls.some((argv) => argv[2] === 'merge'), false);
});

test('open PR remains distinct from unavailable post-merge reconciliation', () => {
  let views = 0;
  const openRun = createFakeRunner([
    [/gh pr view/, { stdout: OPEN }],
    [/gh pr merge/, { code: 1, stderr: 'merge rejected' }],
  ]);
  const openResult = mergePullRequest({ run: openRun, pr: PR });
  assert.equal(openResult.status, 'not-merged');
  assert.equal(openResult.reconciliation.state, 'OPEN');

  const unavailableRun = createFakeRunner([
    [/gh pr view/, () => (views++ === 0 ? { stdout: OPEN } : { code: 1, stderr: 'network unavailable' })],
    [/gh pr merge/, { code: 1, stderr: 'unknown result' }],
  ]);
  const unavailableResult = mergePullRequest({ run: unavailableRun, pr: PR });
  assert.equal(unavailableResult.status, 'unavailable');
  assert.equal(unavailableResult.phase, 'reconciliation');
  assert.equal(unavailableResult.attempted, true);
});
