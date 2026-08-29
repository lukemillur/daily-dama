#!/usr/bin/env node
// Guarded worktree cleanup for the newTicket workflow.
//
// Claude Code holds a `git worktree lock` on an agent's worktree for as long as
// that agent is running, so an agent cannot remove its own worktree — which is
// why they accumulated. Removal is therefore the parent orchestrator's job,
// after the agent call returns and the lock is gone.
//
// This script removes only worktrees it is told about by path, or ones matching
// an explicit `--prefix` this workflow itself created. It refuses — never
// forces — on anything it cannot prove is a finished, fully pushed, unlocked,
// clean, detached workflow worktree.
//
// Usage:
//   node .claude/scripts/worktree-cleanup.mjs --path <dir> [--path <dir> …]
//   node .claude/scripts/worktree-cleanup.mjs --prefix newticket-claim-
//   node .claude/scripts/worktree-cleanup.mjs --release-codex-stage --task T035 --branch task/T035-short-slug [--merged-pr <url>]
//   node .claude/scripts/worktree-cleanup.mjs --list
//   …add --dry-run to report decisions without removing anything.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRunner } from './lib/exec.mjs';
import { assessWorktree, listWorktrees, realPath, releaseAttachedWorktree, removeWorktree } from './lib/worktree.mjs';
import { readMergeStatus } from './pr-merge-status.mjs';

export function parseArgs(argv) {
  const options = { paths: [], prefixes: [], dryRun: false, list: false, repoRoot: null, json: false, releaseCodexStage: false, task: null, branch: null, mergedPr: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--path') options.paths.push(argv[++index]);
    else if (arg === '--prefix') options.prefixes.push(argv[++index]);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--repo') options.repoRoot = argv[++index];
    else if (arg === '--release-codex-stage') options.releaseCodexStage = true;
    else if (arg === '--task') options.task = argv[++index];
    else if (arg === '--branch') options.branch = argv[++index];
    else if (arg === '--merged-pr') options.mergedPr = argv[++index];
    else throw new Error(`unrecognized argument: ${arg}`);
  }
  if (options.releaseCodexStage && (!/^T\d+(?:\.\d+)?$/.test(options.task ?? '') || !/^task\/T\d+(?:\.\d+)?-[a-z0-9-]+$/.test(options.branch ?? ''))) {
    throw new Error('--release-codex-stage requires a valid --task and --branch');
  }
  if (options.mergedPr && !options.releaseCodexStage) throw new Error('--merged-pr requires --release-codex-stage');
  if (!options.list && options.paths.length === 0 && options.prefixes.length === 0 && !options.releaseCodexStage) {
    throw new Error('nothing to do: pass --path, --prefix, or --list');
  }
  return options;
}

/**
 * @param {{run: import('./lib/exec.mjs').Runner, repoRoot: string, options: ReturnType<typeof parseArgs>}} input
 */
export function cleanup({ run, repoRoot, options }) {
  const worktrees = listWorktrees({ run, repoRoot });
  const byPath = new Map(worktrees.map((worktree) => [realPath(worktree.path), worktree]));
  const container = realPath(path.join(repoRoot, '.claude', 'worktrees'));

  if (options.list) {
    return {
      status: 'listed',
      worktrees: worktrees.map((worktree) => ({
        path: worktree.path,
        main: worktree.main,
        locked: worktree.locked,
        branch: worktree.branch,
        detached: worktree.detached,
        ...(worktree.main ? { safe: false, reason: 'main-checkout' } : assessWorktree({ run, repoRoot, worktree })),
      })),
    };
  }

  const targets = [];
  const results = [];
  let mergedHead = null;
  if (options.mergedPr) {
    const status = readMergeStatus({ run, pr: options.mergedPr });
    if (status.status !== 'merged' || !status.headRefOid) {
      return {
        status: 'remnants',
        dryRun: options.dryRun,
        removed: [],
        remnants: [{
          path: options.mergedPr,
          action: 'refused',
          reason: status.status === 'unavailable' ? 'pr-status-unavailable' : 'pr-not-authoritatively-merged',
          detail: status.detail ?? `canonical PR status is ${status.status} with head ${status.headRefOid ?? 'unknown'}`,
        }],
        results: [],
      };
    }
    mergedHead = status.headRefOid;
  }
  if (options.releaseCodexStage) {
    const stagePrefix = `codex-ticket-${options.task.toLowerCase().replace('.', '-')}-`;
    for (const worktree of worktrees) {
      if (worktree.main) continue;
      if (path.dirname(realPath(worktree.path)) !== container) continue;
      if (!path.basename(worktree.path).startsWith(stagePrefix)) continue;
      if (worktree.detached) {
        results.push(removeWorktree({ run, repoRoot, worktree, dryRun: options.dryRun, mergedHead }));
      } else {
        results.push(
          releaseAttachedWorktree({ run, repoRoot, worktree, branch: options.branch, dryRun: options.dryRun, mergedHead }),
        );
      }
    }
  }
  for (const requested of options.paths) {
    const worktree = byPath.get(realPath(requested));
    if (!worktree) {
      results.push({
        path: requested,
        action: 'skipped',
        reason: 'not-a-worktree',
        detail: 'no registered worktree at this path (already removed, or never existed)',
      });
      continue;
    }
    targets.push(worktree);
  }
  for (const prefix of options.prefixes) {
    for (const worktree of worktrees) {
      if (worktree.main) continue;
      if (path.dirname(realPath(worktree.path)) !== container) continue;
      if (!path.basename(worktree.path).startsWith(prefix)) continue;
      if (targets.includes(worktree)) continue;
      targets.push(worktree);
    }
  }

  for (const worktree of targets) {
    results.push(removeWorktree({ run, repoRoot, worktree, dryRun: options.dryRun }));
  }

  const removed = results.filter((entry) => entry.action === 'removed' || entry.action === 'would-remove');
  const remaining = results.filter((entry) => entry.action === 'refused' || entry.action === 'failed');
  return {
    status: remaining.length === 0 ? 'clean' : 'remnants',
    dryRun: options.dryRun,
    removed: removed.map((entry) => entry.path),
    remnants: remaining,
    results,
  };
}

function summarize(result) {
  if (result.status === 'listed') {
    return result.worktrees
      .map((worktree) => `${worktree.safe ? 'removable' : `keep (${worktree.reason})`}\t${worktree.path}`)
      .join('\n');
  }
  const verb = result.dryRun ? 'would remove' : 'removed';
  const lines = [`${verb} ${result.removed.length} worktree(s)`];
  for (const remnant of result.remnants) lines.push(`kept ${remnant.path} — ${remnant.reason}: ${remnant.detail}`);
  return lines.join('\n');
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  const run = createRunner();
  const repoRoot = options.repoRoot ?? run(['git', 'rev-parse', '--show-toplevel']).stdout.trim();
  const result = cleanup({ run, repoRoot, options });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!options.json) process.stderr.write(`${summarize(result)}\n`);
  // Remnants are an expected, reportable outcome — not a failure.
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
