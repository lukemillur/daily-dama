import test from 'node:test';
import assert from 'node:assert/strict';

import { createFakeRunner } from '../lib/exec.mjs';
import { normalizeMergeStatus, parseArgs, readBranchMergeStatus, readMergeStatus } from '../pr-merge-status.mjs';

test('normalizes a confirmed GitHub merge', () => {
  assert.deepEqual(
    normalizeMergeStatus({
      state: 'MERGED',
      mergedAt: '2026-08-14T15:16:15Z',
      mergeCommit: { oid: 'abc123' },
      headRefOid: 'head123',
      url: 'https://github.com/example/repo/pull/81',
    }),
    {
      status: 'merged',
      prUrl: 'https://github.com/example/repo/pull/81',
      mergedAt: '2026-08-14T15:16:15Z',
      mergeCommit: 'abc123',
      headRefOid: 'head123',
    },
  );
});

test('keeps an open PR distinct from an unavailable GitHub query', () => {
  const open = readMergeStatus({
    run: createFakeRunner([[/gh pr view/, { stdout: '{"state":"OPEN","mergedAt":null,"mergeCommit":null,"headRefOid":"head123","url":"https://example.test/pr/1"}' }]]),
    pr: '1',
  });
  assert.equal(open.status, 'not-merged');
  assert.equal(open.state, 'OPEN');

  const unavailable = readMergeStatus({
    run: createFakeRunner([[/gh pr view/, { code: 1, stderr: 'authentication required' }]]),
    pr: '1',
  });
  assert.deepEqual(unavailable, { status: 'unavailable', prUrl: '1', detail: 'authentication required' });
});

test('requires one explicit PR argument', () => {
  assert.deepEqual(parseArgs(['--pr', '81']), { pr: '81' });
  assert.deepEqual(parseArgs(['--branch', 'task/T159-guest-import']), { branch: 'task/T159-guest-import' });
  assert.throws(() => parseArgs([]), /usage:/);
  assert.throws(() => parseArgs(['--pr']), /usage:/);
});

test('finds canonical PR state by branch for a safe resume', () => {
  const run = createFakeRunner([
    [
      /gh pr list/,
      {
        stdout: JSON.stringify([
          {
            state: 'OPEN',
            mergedAt: null,
            mergeCommit: null,
            url: 'https://github.com/example/repo/pull/81',
          },
        ]),
      },
    ],
  ]);
  const result = readBranchMergeStatus({ run, branch: 'task/T159-guest-import' });
  assert.equal(result.status, 'not-merged');
  assert.equal(result.state, 'OPEN');
  assert.equal(result.branch, 'task/T159-guest-import');
});

test('branch lookup distinguishes no PR, ambiguity, and unavailable GitHub state', () => {
  const noPr = readBranchMergeStatus({
    run: createFakeRunner([[/gh pr list/, { stdout: '[]' }]]),
    branch: 'task/T159-guest-import',
  });
  assert.deepEqual(noPr, { status: 'no-pr', branch: 'task/T159-guest-import' });

  const ambiguous = readBranchMergeStatus({
    run: createFakeRunner([[/gh pr list/, { stdout: '[{},{}]' }]]),
    branch: 'task/T159-guest-import',
  });
  assert.equal(ambiguous.status, 'unavailable');
  assert.match(ambiguous.detail, /multiple pull requests/);

  const unavailable = readBranchMergeStatus({
    run: createFakeRunner([[/gh pr list/, { code: 1, stderr: 'network unavailable' }]]),
    branch: 'task/T159-guest-import',
  });
  assert.deepEqual(unavailable, {
    status: 'unavailable',
    branch: 'task/T159-guest-import',
    detail: 'network unavailable',
  });
});
