#!/usr/bin/env node
// Read-only reconciliation for the result of one `gh pr merge` attempt.
//
// `gh pr merge --delete-branch` can merge on GitHub and still return non-zero
// while performing a local post-merge operation. Workflow agents must query
// this script before deciding whether the cycle is blocked.

import { pathToFileURL } from 'node:url';
import { createRunner } from './lib/exec.mjs';

export function parseArgs(argv) {
  if (argv.length !== 2 || !['--pr', '--branch'].includes(argv[0]) || !argv[1]) {
    throw new Error('usage: node .claude/scripts/pr-merge-status.mjs (--pr <number-or-url> | --branch <task-branch>)');
  }
  return argv[0] === '--pr' ? { pr: argv[1] } : { branch: argv[1] };
}

/** @param {{state?: string, mergedAt?: string|null, mergeCommit?: {oid?: string}|null, headRefOid?: string|null, url?: string}} payload */
export function normalizeMergeStatus(payload) {
  if (payload.state === 'MERGED' && payload.mergedAt && payload.mergeCommit?.oid) {
    return {
      status: 'merged',
      prUrl: payload.url ?? null,
      mergedAt: payload.mergedAt,
      mergeCommit: payload.mergeCommit.oid,
      headRefOid: payload.headRefOid ?? null,
    };
  }
  return {
    status: 'not-merged',
    prUrl: payload.url ?? null,
    state: payload.state ?? 'UNKNOWN',
    mergedAt: payload.mergedAt ?? null,
    mergeCommit: payload.mergeCommit?.oid ?? null,
    headRefOid: payload.headRefOid ?? null,
  };
}

export function readMergeStatus({ run, pr }) {
  const result = run(['gh', 'pr', 'view', pr, '--json', 'state,mergedAt,mergeCommit,headRefOid,url'], { allowFailure: true });
  if (result.code !== 0) {
    return {
      status: 'unavailable',
      prUrl: pr,
      detail: result.stderr.trim() || `gh pr view exited ${result.code}`,
    };
  }
  try {
    return normalizeMergeStatus(JSON.parse(result.stdout));
  } catch (error) {
    return {
      status: 'unavailable',
      prUrl: pr,
      detail: `invalid gh pr view JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function readBranchMergeStatus({ run, branch }) {
  const result = run(
    ['gh', 'pr', 'list', '--head', branch, '--state', 'all', '--limit', '2', '--json', 'state,mergedAt,mergeCommit,headRefOid,url'],
    { allowFailure: true },
  );
  if (result.code !== 0) {
    return {
      status: 'unavailable',
      branch,
      detail: result.stderr.trim() || `gh pr list exited ${result.code}`,
    };
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    return {
      status: 'unavailable',
      branch,
      detail: `invalid gh pr list JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!Array.isArray(payload)) {
    return { status: 'unavailable', branch, detail: 'invalid gh pr list JSON: expected an array' };
  }
  if (payload.length === 0) return { status: 'no-pr', branch };
  if (payload.length > 1) return { status: 'unavailable', branch, detail: 'multiple pull requests match this branch' };
  return { ...normalizeMergeStatus(payload[0]), branch };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  const run = createRunner();
  const result = args.pr ? readMergeStatus({ run, pr: args.pr }) : readBranchMergeStatus({ run, branch: args.branch });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
