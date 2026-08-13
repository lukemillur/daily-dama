// Git worktree inspection and guarded removal.
//
// Removal is deliberately conservative: a worktree is removed only when every
// safety check passes. Anything unverifiable is a refusal, never a `--force`.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Canonical absolute path.
 *
 * `git worktree list` reports resolved paths (on macOS `/var/…` is a symlink to
 * `/private/var/…`), so comparing raw strings mismatches paths that name the
 * same directory. A path that no longer exists falls back to `path.resolve`.
 */
export function realPath(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

/**
 * Parse `git worktree list --porcelain`.
 *
 * @param {string} stdout
 * @returns {Array<{path: string, head: string|null, branch: string|null, detached: boolean, locked: boolean, lockReason: string, prunable: boolean, main: boolean}>}
 */
export function parseWorktreeList(stdout) {
  const worktrees = [];
  let current = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = {
        path: line.slice('worktree '.length).trim(),
        head: null,
        branch: null,
        detached: false,
        locked: false,
        lockReason: '',
        prunable: false,
        main: worktrees.length === 0,
      };
      worktrees.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length).trim();
    else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).trim();
    else if (line.trim() === 'detached') current.detached = true;
    else if (line.startsWith('locked')) {
      current.locked = true;
      current.lockReason = line.slice('locked'.length).trim();
    } else if (line.startsWith('prunable')) current.prunable = true;
  }
  return worktrees;
}

/** Absolute, symlink-insensitive comparison helper. */
function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Decide whether a worktree may be removed.
 *
 * Refuses — never forces — when the worktree is the main checkout, is locked
 * (Claude Code locks an agent's worktree for the lifetime of that agent), still
 * has a branch checked out, holds uncommitted or untracked files, holds commits
 * that exist nowhere else, sits outside the workflow's own worktree directory,
 * or has a live process working inside it.
 *
 * @param {object} input
 * @param {import('./exec.mjs').Runner} input.run
 * @param {string} input.repoRoot
 * @param {ReturnType<typeof parseWorktreeList>[number]} input.worktree
 * @param {string} [input.containerDir] directory workflow worktrees must live under
 * @returns {{safe: boolean, reason: string, detail: string}}
 */
export function assessWorktree({ run, repoRoot, worktree, containerDir }) {
  const container = containerDir ?? path.join(repoRoot, '.claude', 'worktrees');
  const refuse = (reason, detail) => ({ safe: false, reason, detail });

  if (worktree.main) return refuse('main-checkout', 'refusing to remove the main checkout');
  if (realPath(worktree.path) === realPath(repoRoot)) {
    return refuse('main-checkout', 'path resolves to the repository root');
  }
  if (!isInside(realPath(worktree.path), realPath(container))) {
    return refuse('outside-container', `not under ${container}; treated as user-owned`);
  }
  if (worktree.locked) {
    return refuse('locked', `worktree is locked${worktree.lockReason ? `: ${worktree.lockReason}` : ''}`);
  }
  if (!worktree.detached && worktree.branch) {
    return refuse('branch-checked-out', `${worktree.branch} is still checked out here`);
  }

  const status = run(['git', '-C', worktree.path, 'status', '--porcelain'], { allowFailure: true });
  if (status.code !== 0) return refuse('unverifiable', `git status failed: ${status.stderr.trim()}`);
  if (status.stdout.trim() !== '') return refuse('dirty', 'uncommitted or untracked files present');

  const unreachable = run(['git', '-C', worktree.path, 'rev-list', '--count', 'HEAD', '--not', '--remotes'], {
    allowFailure: true,
  });
  if (unreachable.code !== 0) return refuse('unverifiable', `git rev-list failed: ${unreachable.stderr.trim()}`);
  if (unreachable.stdout.trim() !== '0') {
    return refuse('unpushed-commits', `${unreachable.stdout.trim()} commit(s) exist only here`);
  }

  // Ask lsof for every process cwd, then compare paths ourselves. Querying the
  // worktree path as an exact lsof name misses processes running in descendants
  // such as `src/` or `node_modules/`.
  const processes = run(['lsof', '-d', 'cwd', '-Fn'], { allowFailure: true });
  if (processes.code !== 0 && !(processes.code === 1 && processes.stdout.trim() === '' && processes.stderr.trim() === '')) {
    return refuse(
      'unverifiable',
      `lsof failed while checking active processes: ${processes.stderr.trim() || `exit ${processes.code}`}`,
    );
  }
  const worktreePath = realPath(worktree.path);
  const activeCwd = processes.stdout
    .split('\n')
    .filter((line) => line.startsWith('n'))
    .map((line) => line.slice(1))
    .find((cwd) => {
      const resolved = realPath(cwd);
      return resolved === worktreePath || isInside(resolved, worktreePath);
    });
  if (activeCwd) {
    return refuse('active-process', `a process is running with cwd ${activeCwd} inside this worktree`);
  }

  return { safe: true, reason: 'clean', detail: 'detached, clean, fully pushed, unlocked' };
}

/**
 * Remove a worktree if `assessWorktree` allows it.
 *
 * @param {object} input
 * @param {import('./exec.mjs').Runner} input.run
 * @param {string} input.repoRoot
 * @param {ReturnType<typeof parseWorktreeList>[number]} input.worktree
 * @param {boolean} [input.dryRun]
 * @param {string} [input.containerDir]
 * @returns {{path: string, action: 'removed'|'would-remove'|'refused'|'failed', reason: string, detail: string}}
 */
export function removeWorktree({ run, repoRoot, worktree, dryRun = false, containerDir }) {
  const assessment = assessWorktree({ run, repoRoot, worktree, containerDir });
  if (!assessment.safe) {
    return { path: worktree.path, action: 'refused', reason: assessment.reason, detail: assessment.detail };
  }
  if (dryRun) {
    return { path: worktree.path, action: 'would-remove', reason: assessment.reason, detail: assessment.detail };
  }
  // No --force: the assessment already proved the worktree is clean, so a plain
  // remove either succeeds or tells us something changed underneath us.
  const removal = run(['git', '-C', repoRoot, 'worktree', 'remove', worktree.path], { allowFailure: true });
  if (removal.code !== 0) {
    return { path: worktree.path, action: 'failed', reason: 'remove-failed', detail: removal.stderr.trim() };
  }
  return { path: worktree.path, action: 'removed', reason: assessment.reason, detail: assessment.detail };
}

/** List worktrees known to the repository. */
export function listWorktrees({ run, repoRoot }) {
  return parseWorktreeList(run(['git', '-C', repoRoot, 'worktree', 'list', '--porcelain']).stdout);
}
