#!/usr/bin/env node
// Deterministic backlog claim / resume for the newTicket workflow.
//
// Replaces the former `ticket-claim` subagent: selection, dependency checking,
// collision detection, branching, the status flip, the claim commit and the
// claim push are all mechanical, so they run here instead of costing a fresh
// model context every cycle.
//
// Guarantees:
//   * never switches branches or writes files in the orchestrating checkout —
//     every mutation happens in a temporary worktree this script creates and
//     removes itself
//   * never force-pushes and never deletes another worker's branch: a rejected
//     push is the collision detector working, and it is reported as a blocker
//   * emits one JSON object on stdout; a human summary goes to stderr
//
// Usage:
//   node .claude/scripts/ticket-claim.mjs                  # next actionable task
//   node .claude/scripts/ticket-claim.mjs T035             # named task
//   node .claude/scripts/ticket-claim.mjs resume T035      # resume an existing claim
//   node .claude/scripts/ticket-claim.mjs T035 --resume    # same
//   node .claude/scripts/ticket-claim.mjs --dry-run        # decide, change nothing

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRunner } from './lib/exec.mjs';
import {
  branchNameFor,
  parseBacklog,
  parseDoneIds,
  resolvePlanningPolicy,
  selectTask,
  setTaskStatus,
  taskIdFromBranch,
} from './lib/tasks.mjs';

const TASK_ID = /^T\d+(\.\d+)?$/i;

export function parseArgs(argv) {
  const options = {
    taskId: null,
    resume: false,
    dryRun: false,
    fetch: true,
    base: 'origin/development',
    repoRoot: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--resume' || arg === 'resume') options.resume = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-fetch') options.fetch = false;
    else if (arg === '--json') options.json = true;
    else if (arg === '--task') options.taskId = argv[++index];
    else if (arg === '--base') options.base = argv[++index];
    else if (arg === '--repo') options.repoRoot = argv[++index];
    else if (TASK_ID.test(arg)) options.taskId = arg.toUpperCase();
    else throw new Error(`unrecognized argument: ${arg}`);
  }
  if (options.taskId) options.taskId = options.taskId.toUpperCase();
  if (options.resume && !options.taskId) throw new Error('resume requires a task ID, e.g. `resume T035`');
  return options;
}

function readFileAtRef(run, repoRoot, ref, filePath) {
  const result = run(['git', '-C', repoRoot, 'show', `${ref}:${filePath}`], { allowFailure: true });
  if (result.code !== 0) throw new Error(`cannot read ${filePath} at ${ref}: ${result.stderr.trim()}`);
  return result.stdout;
}

function fileExistsAtRef(run, repoRoot, ref, filePath) {
  return run(['git', '-C', repoRoot, 'cat-file', '-e', `${ref}:${filePath}`], { allowFailure: true }).code === 0;
}

/** taskId -> [branch, …] for every `task/<ID>-*` branch on the remote. */
export function remoteClaims(run, repoRoot) {
  const result = run(['git', '-C', repoRoot, 'ls-remote', '--heads', 'origin', 'refs/heads/task/*']);
  const claims = new Map();
  for (const line of result.stdout.split('\n')) {
    const ref = line.split('\t')[1];
    if (!ref) continue;
    const branch = ref.replace(/^refs\/heads\//, '');
    const id = taskIdFromBranch(branch);
    if (!id) continue;
    if (!claims.has(id)) claims.set(id, []);
    claims.get(id).push(branch);
  }
  return claims;
}

function planFileFor(taskId) {
  return `.claude/plans/${taskId}.md`;
}

function blocked(reason, detail, extra = {}) {
  return { status: 'blocked', blocker: { reason, detail }, ...extra };
}

/**
 * Resume an interrupted task. Read-only with respect to the claim branch: it
 * inspects the branch, never rewrites, re-pushes or re-points it.
 */
function resumeTask({ run, repoRoot, options }) {
  const claims = remoteClaims(run, repoRoot);
  const branches = claims.get(options.taskId) ?? [];
  if (branches.length === 0) {
    return blocked(
      'no-claim-branch',
      `no remote branch matches task/${options.taskId}-*; nothing to resume. Claim it fresh instead.`,
      { taskId: options.taskId },
    );
  }
  if (branches.length > 1) {
    return blocked(
      'ambiguous-claim-branches',
      `${branches.length} remote branches match task/${options.taskId}-*: ${branches.join(', ')}. ` +
        'Resolve by hand — this script will not guess which claim is live.',
      { taskId: options.taskId, branches },
    );
  }
  const branch = branches[0];
  run(['git', '-C', repoRoot, 'fetch', 'origin', branch]);
  const sha = run(['git', '-C', repoRoot, 'rev-parse', 'FETCH_HEAD']).stdout.trim();

  const tasks = parseBacklog(readFileAtRef(run, repoRoot, sha, 'TASKS.md'));
  const task = tasks.find((candidate) => candidate.id === options.taskId);
  if (!task) {
    const doneIds = parseDoneIds(readFileAtRef(run, repoRoot, sha, 'TASKS_DONE.md'));
    const detail = doneIds.has(options.taskId)
      ? `${options.taskId} is already archived as Done on ${branch}; there is nothing left to resume.`
      : `${branch} exists but ${options.taskId} is not in its Backlog; the branch does not correspond to this task.`;
    return blocked('branch-mismatch', detail, { taskId: options.taskId, branch });
  }

  const planFile = planFileFor(options.taskId);
  const planExists = fileExistsAtRef(run, repoRoot, sha, planFile);
  const planning = resolvePlanningPolicy(task);
  return {
    status: 'resumed',
    taskId: task.id,
    title: task.title,
    branch,
    entry: task.entry,
    planFile,
    planExists,
    planning: planExists
      ? { policy: 'implementer', source: 'existing-plan', reason: `${planFile} already exists on the branch` }
      : planning,
  };
}

/** Create the claim branch, flip the status, commit, push. */
function pushClaim({ run, repoRoot, base, task, branch, fileSystem, claimNonce }) {
  const worktreePath = path.join(
    repoRoot,
    '.claude',
    'worktrees',
    `newticket-claim-${task.id}-${process.pid}-${Date.now().toString(36)}`,
  );
  let worktreeCreated = false;
  let branchCreated = false;
  try {
    run(['git', '-C', repoRoot, 'worktree', 'add', '--detach', worktreePath, base]);
    worktreeCreated = true;
    run(['git', '-C', worktreePath, 'switch', '-c', branch]);
    branchCreated = true;

    const tasksPath = path.join(worktreePath, 'TASKS.md');
    const updated = setTaskStatus(fileSystem.readFileSync(tasksPath, 'utf8'), task.id, 'In progress');
    fileSystem.writeFileSync(tasksPath, updated);

    run(['git', '-C', worktreePath, 'add', 'TASKS.md']);
    // The nonce makes independently-created claim commits necessarily diverge,
    // even when both workers share the same parent, tree, author and timestamp.
    // A concurrent second push therefore receives a non-fast-forward rejection
    // instead of succeeding as an identical "everything up to date" commit.
    run([
      'git',
      '-C',
      worktreePath,
      'commit',
      '-m',
      `Claim \`${task.id}\``,
      '-m',
      `Claim-Nonce: ${claimNonce}`,
    ]);

    // No --force, ever. A rejected push means another worker got there first.
    const push = run(['git', '-C', worktreePath, 'push', 'origin', `${branch}:${branch}`], { allowFailure: true });
    if (push.code !== 0) {
      return { ok: false, stderr: `${push.stdout}\n${push.stderr}`.trim() };
    }
    return { ok: true };
  } finally {
    if (worktreeCreated) {
      // The only thing this worktree can contain is the status edit made above,
      // so forcing its removal cannot lose anyone else's work. This --force is
      // scoped to a directory this process created seconds ago; it is not a
      // git history operation.
      run(['git', '-C', worktreePath, 'switch', '--detach'], { allowFailure: true });
      run(['git', '-C', repoRoot, 'worktree', 'remove', '--force', worktreePath], { allowFailure: true });
    }
    if (branchCreated) {
      // Delete only a branch this invocation successfully created. In
      // particular, a failed `switch -c` must never delete a pre-existing
      // local task branch with the same deterministic name.
      run(['git', '-C', repoRoot, 'branch', '-D', branch], { allowFailure: true });
    }
  }
}

export function claim({ run, repoRoot, options, fileSystem = fs, createClaimNonce = randomUUID }) {
  if (options.fetch) run(['git', '-C', repoRoot, 'fetch', 'origin', 'development']);
  if (options.resume) return resumeTask({ run, repoRoot, options });

  const tasks = parseBacklog(readFileAtRef(run, repoRoot, options.base, 'TASKS.md'));
  const doneIds = parseDoneIds(readFileAtRef(run, repoRoot, options.base, 'TASKS_DONE.md'));
  const claimedBranches = remoteClaims(run, repoRoot);

  const selection = selectTask({ tasks, doneIds, claimedBranches, requestedId: options.taskId });
  if (selection.status === 'backlog-exhausted') {
    return { status: 'backlog-exhausted', skipped: selection.skipped };
  }
  if (selection.status === 'blocked') {
    const { reason, detail, taskId } = selection.blocker;
    const result = blocked(reason, detail, { taskId: taskId ?? null, skipped: selection.skipped });
    if (reason === 'claimed') {
      result.blocker.resumeCommand = `/newTicket resume ${taskId}`;
      result.branches = claimedBranches.get(taskId) ?? [];
    }
    return result;
  }

  const task = selection.task;
  const branch = branchNameFor(task);
  const localBranch = run(
    ['git', '-C', repoRoot, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
    { allowFailure: true },
  );
  if (localBranch.code === 0) {
    return blocked(
      'local-branch-exists',
      `local branch ${branch} already exists; refusing to overwrite or delete it. Inspect it and either resume its remote claim or resolve it manually.`,
      { taskId: task.id, branch },
    );
  }
  if (localBranch.code !== 1) {
    return blocked(
      'local-branch-check-failed',
      `could not determine whether local branch ${branch} exists: ${localBranch.stderr.trim() || `git exited ${localBranch.code}`}`,
      { taskId: task.id, branch },
    );
  }
  const planning = resolvePlanningPolicy(task);
  const base = {
    taskId: task.id,
    title: task.title,
    branch,
    entry: task.entry,
    planFile: planFileFor(task.id),
    planExists: false,
    planning,
    resolvedFromParent: Boolean(selection.resolvedFromParent),
    skipped: selection.skipped,
  };

  if (options.dryRun) return { status: 'claimed', dryRun: true, ...base };

  const push = pushClaim({
    run,
    repoRoot,
    base: options.base,
    task,
    branch,
    fileSystem,
    claimNonce: createClaimNonce(),
  });
  if (!push.ok) {
    const recheck = remoteClaims(run, repoRoot).get(task.id) ?? [];
    if (recheck.length > 0) {
      return blocked(
        'claimed',
        `push of ${branch} was rejected and ${recheck.join(', ')} now exists on the remote — another worker claimed ${task.id} first.`,
        { taskId: task.id, branches: recheck },
      );
    }
    return blocked('push-failed', `push of ${branch} failed and no competing branch exists: ${push.stderr}`, {
      taskId: task.id,
    });
  }
  return { status: 'claimed', dryRun: false, ...base };
}

function summarize(result) {
  switch (result.status) {
    case 'claimed':
      return `${result.taskId}: ${result.dryRun ? 'would claim' : 'claimed'} on ${result.branch} — planning: ${result.planning.policy} (${result.planning.source})`;
    case 'resumed':
      return `${result.taskId}: resuming ${result.branch} — plan ${result.planExists ? 'exists' : 'missing'}, planning: ${result.planning.policy}`;
    case 'backlog-exhausted':
      return 'backlog exhausted — no actionable task remains';
    default:
      return `blocked (${result.blocker.reason}): ${result.blocker.detail}`;
  }
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
  const repoRoot =
    options.repoRoot ?? run(['git', 'rev-parse', '--show-toplevel']).stdout.trim();

  let result;
  try {
    result = claim({ run, repoRoot, options });
  } catch (error) {
    result = blocked('script-error', error.message);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!options.json) process.stderr.write(`${summarize(result)}\n`);
  process.exit(result.status === 'blocked' ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
