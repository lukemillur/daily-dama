#!/usr/bin/env node
// Read-only reconciliation for the result of one `gh pr merge` attempt.
//
// `gh pr merge --delete-branch` can merge on GitHub and still return non-zero
// while performing a local post-merge operation. Workflow agents must query
// this script before deciding whether the cycle is blocked.

import { pathToFileURL } from 'node:url';
import { createRunner } from './lib/exec.mjs';

export function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--pr' || !argv[1]) {
    throw new Error('usage: node .claude/scripts/pr-merge-status.mjs --pr <number-or-url>');
  }
  return { pr: argv[1] };
}

/** @param {{state?: string, mergedAt?: string|null, mergeCommit?: {oid?: string}|null, url?: string}} payload */
export function normalizeMergeStatus(payload) {
  if (payload.state === 'MERGED' && payload.mergedAt && payload.mergeCommit?.oid) {
    return {
      status: 'merged',
      prUrl: payload.url ?? null,
      mergedAt: payload.mergedAt,
      mergeCommit: payload.mergeCommit.oid,
    };
  }
  return {
    status: 'not-merged',
    prUrl: payload.url ?? null,
    state: payload.state ?? 'UNKNOWN',
    mergedAt: payload.mergedAt ?? null,
    mergeCommit: payload.mergeCommit?.oid ?? null,
  };
}

export function readMergeStatus({ run, pr }) {
  const result = run(['gh', 'pr', 'view', pr, '--json', 'state,mergedAt,mergeCommit,url'], { allowFailure: true });
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

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(readMergeStatus({ run: createRunner(), pr: args.pr }))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
