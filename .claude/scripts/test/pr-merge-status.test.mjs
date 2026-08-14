import test from 'node:test';
import assert from 'node:assert/strict';

import { createFakeRunner } from '../lib/exec.mjs';
import { normalizeMergeStatus, parseArgs, readMergeStatus } from '../pr-merge-status.mjs';

test('normalizes a confirmed GitHub merge', () => {
  assert.deepEqual(
    normalizeMergeStatus({
      state: 'MERGED',
      mergedAt: '2026-08-14T15:16:15Z',
      mergeCommit: { oid: 'abc123' },
      url: 'https://github.com/example/repo/pull/81',
    }),
    {
      status: 'merged',
      prUrl: 'https://github.com/example/repo/pull/81',
      mergedAt: '2026-08-14T15:16:15Z',
      mergeCommit: 'abc123',
    },
  );
});

test('keeps an open PR distinct from an unavailable GitHub query', () => {
  const open = readMergeStatus({
    run: createFakeRunner([[/gh pr view/, { stdout: '{"state":"OPEN","mergedAt":null,"mergeCommit":null,"url":"https://example.test/pr/1"}' }]]),
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
  assert.throws(() => parseArgs([]), /usage:/);
  assert.throws(() => parseArgs(['--pr']), /usage:/);
});
