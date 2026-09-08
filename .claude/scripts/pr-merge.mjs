#!/usr/bin/env node
// Perform at most one ordinary squash merge without touching local branches.
//
// Passing an explicit --repo selector makes GitHub CLI treat branch deletion as
// remote-only. This avoids `gh pr merge --delete-branch` trying to check out the
// PR base branch inside a task worktree, where the base is already attached to
// the repository's main checkout.

import { pathToFileURL } from 'node:url';
import { createRunner } from './lib/exec.mjs';
import { readMergeStatus } from './pr-merge-status.mjs';

export function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--pr' || !argv[1]) {
    throw new Error('usage: node .claude/scripts/pr-merge.mjs --pr <pull-request-url>');
  }
  return { pr: argv[1] };
}

export function repositorySelectorFromPr(pr) {
  let url;
  try {
    url = new URL(pr);
  } catch {
    throw new Error('--pr must be a full pull-request URL');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.protocol !== 'https:' || parts.length !== 4 || parts[2] !== 'pull' || !/^\d+$/.test(parts[3])) {
    throw new Error('--pr must look like https://<host>/<owner>/<repo>/pull/<number>');
  }
  return `${url.host}/${parts[0]}/${parts[1]}`;
}

/** @param {{run: import('./lib/exec.mjs').Runner, pr: string}} input */
export function mergePullRequest({ run, pr }) {
  const repository = repositorySelectorFromPr(pr);
  const preflight = readMergeStatus({ run, pr });
  if (preflight.status === 'unavailable') {
    return {
      status: 'unavailable',
      phase: 'preflight',
      attempted: false,
      commandExitCode: null,
      commandOutput: '',
      prUrl: pr,
      repository,
      reconciliation: preflight,
    };
  }
  if (preflight.status === 'merged') {
    return {
      status: 'merged',
      phase: 'preflight',
      attempted: false,
      commandExitCode: null,
      commandOutput: '',
      prUrl: preflight.prUrl ?? pr,
      repository,
      reconciliation: preflight,
    };
  }
  if (preflight.state !== 'OPEN') {
    return {
      status: 'not-merged',
      phase: 'preflight',
      attempted: false,
      commandExitCode: null,
      commandOutput: '',
      prUrl: preflight.prUrl ?? pr,
      repository,
      reconciliation: preflight,
    };
  }

  const command = ['gh', 'pr', 'merge', pr, '--repo', repository, '--squash', '--delete-branch'];
  const attempt = run(command, { allowFailure: true });
  const reconciliation = readMergeStatus({ run, pr });
  return {
    status: reconciliation.status,
    phase: 'reconciliation',
    attempted: true,
    prUrl: reconciliation.prUrl ?? pr,
    repository,
    command,
    commandExitCode: attempt.code,
    commandOutput: `${attempt.stdout}${attempt.stderr}`.trim(),
    reconciliation,
  };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(mergePullRequest({ run: createRunner(), pr: args.pr }))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
