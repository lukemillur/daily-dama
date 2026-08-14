// End-to-end checks against real git, in throwaway repositories with a local
// bare "remote". Nothing here touches the Daily Dama checkout.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLAIM = path.join(here, '../ticket-claim.mjs');
const CLEANUP = path.join(here, '../worktree-cleanup.mjs');
const TASKS = fs.readFileSync(path.join(here, 'fixtures/TASKS.fixture.md'), 'utf8');
const DONE = fs.readFileSync(path.join(here, 'fixtures/TASKS_DONE.fixture.md'), 'utf8');

function git(cwd, ...args) {
  const proc = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (proc.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${proc.stderr}`);
  return proc.stdout.trim();
}

function node(script, args, cwd) {
  const proc = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  return { code: proc.status, json: JSON.parse(proc.stdout), stderr: proc.stderr };
}

/** A bare remote plus a working checkout on `development`. */
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'newticket-it-'));
  const remote = path.join(root, 'remote.git');
  const local = path.join(root, 'local');
  git(root, 'init', '--bare', '--initial-branch=development', remote);
  git(root, 'init', '--initial-branch=development', local);
  git(local, 'config', 'user.email', 'test@example.com');
  git(local, 'config', 'user.name', 'Test');
  git(local, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(local, 'TASKS.md'), TASKS);
  fs.writeFileSync(path.join(local, 'TASKS_DONE.md'), DONE);
  fs.mkdirSync(path.join(local, '.claude/plans'), { recursive: true });
  fs.writeFileSync(path.join(local, '.claude/plans/.gitkeep'), '');
  fs.writeFileSync(path.join(local, '.gitignore'), '.claude/worktrees/\n');
  git(local, 'add', '-A');
  git(local, 'commit', '-m', 'seed');
  git(local, 'remote', 'add', 'origin', remote);
  git(local, 'push', '-u', 'origin', 'development');
  return { root, remote, local };
}

function cleanupRepo(repo) {
  fs.rmSync(repo.root, { recursive: true, force: true });
}

test('a real claim pushes the branch and leaves the orchestrating checkout untouched', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  const headBefore = git(repo.local, 'rev-parse', 'HEAD');
  const result = node(CLAIM, ['--repo', repo.local], repo.local);

  assert.equal(result.code, 0);
  assert.equal(result.json.status, 'claimed');
  assert.equal(result.json.taskId, 'T100');
  assert.equal(result.json.branch, 'task/T100-rename-a-label-on-the-summary-card');
  assert.equal(result.json.planning.policy, 'implementer');
  assert.equal(result.json.planExists, false);
  assert.ok(result.json.entry.startsWith('### [T100]'));

  // The claim landed on the remote, with exactly one status flipped.
  const remoteBranches = git(repo.local, 'ls-remote', '--heads', 'origin');
  assert.match(remoteBranches, /refs\/heads\/task\/T100-rename-a-label-on-the-summary-card/);
  const pushed = git(repo.local, 'show', `origin/${result.json.branch}:TASKS.md`);
  assert.match(pushed, /### \[T100\][\s\S]*?- \*\*Status:\*\* In progress/);
  assert.match(pushed, /### \[T101\][\s\S]*?- \*\*Status:\*\* Not started/);
  const claimMessage = git(repo.local, 'show', '-s', '--format=%B', `origin/${result.json.branch}`);
  assert.match(claimMessage, /^Claim `T100`\n\nClaim-Nonce: [0-9a-f-]{36}$/);

  // The orchestrating checkout never moved and stayed clean.
  assert.equal(git(repo.local, 'rev-parse', 'HEAD'), headBefore);
  assert.equal(git(repo.local, 'symbolic-ref', '--short', 'HEAD'), 'development');
  assert.equal(git(repo.local, 'status', '--porcelain'), '');
  assert.match(fs.readFileSync(path.join(repo.local, 'TASKS.md'), 'utf8'), /### \[T100\][\s\S]*?Not started/);

  // The temporary claim worktree removed itself.
  assert.equal(git(repo.local, 'worktree', 'list').split('\n').length, 1);
  assert.equal(fs.readdirSync(path.join(repo.local, '.claude/worktrees')).length, 0);
});

test('a pre-existing local task branch is preserved and blocks a claim', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  const branch = 'task/T100-rename-a-label-on-the-summary-card';
  git(repo.local, 'branch', branch);
  const branchBefore = git(repo.local, 'rev-parse', branch);

  const result = node(CLAIM, ['--repo', repo.local, 'T100'], repo.local);

  assert.equal(result.code, 1);
  assert.equal(result.json.status, 'blocked');
  assert.equal(result.json.blocker.reason, 'local-branch-exists');
  assert.equal(git(repo.local, 'rev-parse', branch), branchBefore, 'local branch untouched');
  assert.equal(git(repo.local, 'worktree', 'list').split('\n').length, 1);
});

test('a second claim of the same task is refused without touching the existing branch', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  const first = node(CLAIM, ['--repo', repo.local, 'T100'], repo.local);
  assert.equal(first.json.status, 'claimed');
  const claimedSha = git(repo.local, 'rev-parse', `origin/${first.json.branch}`);

  const second = node(CLAIM, ['--repo', repo.local, 'T100'], repo.local);
  assert.equal(second.code, 1, 'blocked exits non-zero');
  assert.equal(second.json.status, 'blocked');
  assert.equal(second.json.blocker.reason, 'claimed');
  assert.equal(second.json.blocker.resumeCommand, '/newTicket resume T100');
  assert.equal(git(repo.local, 'rev-parse', `origin/${first.json.branch}`), claimedSha, 'branch untouched');
});

test('continuous mode stops on the claimed head of the backlog', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  node(CLAIM, ['--repo', repo.local, 'T100'], repo.local);
  const next = node(CLAIM, ['--repo', repo.local], repo.local);
  assert.equal(next.json.status, 'blocked');
  assert.equal(next.json.taskId, 'T100', 'must not silently advance to T101');
});

test('resume finds the claim branch and reports whether a durable plan exists', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  const claimed = node(CLAIM, ['--repo', repo.local, 'T101'], repo.local);
  assert.equal(claimed.json.status, 'claimed');

  const withoutPlan = node(CLAIM, ['--repo', repo.local, 'resume', 'T101'], repo.local);
  assert.equal(withoutPlan.json.status, 'resumed');
  assert.equal(withoutPlan.json.planExists, false);
  assert.equal(withoutPlan.json.planning.policy, 'required');
  assert.equal(withoutPlan.json.branch, claimed.json.branch);

  // Simulate a planner that got as far as committing its plan.
  const staging = path.join(repo.root, 'staging');
  git(repo.root, 'clone', repo.remote, staging);
  git(staging, 'config', 'user.email', 'test@example.com');
  git(staging, 'config', 'user.name', 'Test');
  git(staging, 'checkout', claimed.json.branch);
  fs.mkdirSync(path.join(staging, '.claude/plans'), { recursive: true });
  fs.writeFileSync(path.join(staging, '.claude/plans/T101.md'), '# Plan\n');
  git(staging, 'add', '-A');
  git(staging, 'commit', '-m', 'Add plan for T101');
  git(staging, 'push', 'origin', claimed.json.branch);

  const withPlan = node(CLAIM, ['--repo', repo.local, 'resume', 'T101'], repo.local);
  assert.equal(withPlan.json.status, 'resumed');
  assert.equal(withPlan.json.planExists, true);
  assert.equal(withPlan.json.planning.source, 'existing-plan');
  assert.equal(withPlan.json.planFile, '.claude/plans/T101.md');
});

test('resume refuses when two branches claim the same task', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  node(CLAIM, ['--repo', repo.local, 'T100'], repo.local);
  git(repo.local, 'push', 'origin', 'origin/development:refs/heads/task/T100-duplicate-claim');

  const result = node(CLAIM, ['--repo', repo.local, 'resume', 'T100'], repo.local);
  assert.equal(result.json.status, 'blocked');
  assert.equal(result.json.blocker.reason, 'ambiguous-claim-branches');
  assert.equal(result.json.branches.length, 2);
});

test('a claimed branch is still checkoutable by the next stage after the claim worktree is gone', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  const claimed = node(CLAIM, ['--repo', repo.local, 'T100'], repo.local);
  const stage = path.join(repo.local, '.claude/worktrees/agent-stage');
  git(repo.local, 'worktree', 'add', '--detach', stage, 'origin/development');
  git(stage, 'fetch', 'origin', claimed.json.branch);
  git(stage, 'checkout', '-B', claimed.json.branch, 'FETCH_HEAD');
  assert.equal(git(stage, 'symbolic-ref', '--short', 'HEAD'), claimed.json.branch);
  assert.match(fs.readFileSync(path.join(stage, 'TASKS.md'), 'utf8'), /### \[T100\][\s\S]*?In progress/);
});

test('cleanup removes a finished stage worktree and refuses the unsafe ones', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  const finished = path.join(repo.local, '.claude/worktrees/agent-finished');
  const dirty = path.join(repo.local, '.claude/worktrees/agent-dirty');
  const onBranch = path.join(repo.local, '.claude/worktrees/agent-onbranch');
  const locked = path.join(repo.local, '.claude/worktrees/agent-locked');
  git(repo.local, 'worktree', 'add', '--detach', finished, 'origin/development');
  git(repo.local, 'worktree', 'add', '--detach', dirty, 'origin/development');
  git(repo.local, 'worktree', 'add', '-b', 'stage-branch', onBranch, 'origin/development');
  git(repo.local, 'worktree', 'add', '--detach', locked, 'origin/development');
  fs.writeFileSync(path.join(dirty, 'scratch.txt'), 'work in progress\n');
  git(repo.local, 'worktree', 'lock', locked);

  const real = (target) => fs.realpathSync(target);
  const dryRun = node(CLEANUP, ['--repo', repo.local, '--path', finished, '--dry-run'], repo.local);
  assert.deepEqual(dryRun.json.removed.map(real), [real(finished)]);
  assert.ok(fs.existsSync(finished), 'dry run removes nothing');

  const result = node(
    CLEANUP,
    ['--repo', repo.local, '--path', finished, '--path', dirty, '--path', onBranch, '--path', locked],
    repo.local,
  );
  assert.deepEqual(result.json.removed.map((target) => path.basename(target)), ['agent-finished']);
  assert.equal(fs.existsSync(finished), false);
  assert.equal(fs.existsSync(dirty), true);
  assert.equal(fs.existsSync(onBranch), true);
  assert.equal(fs.existsSync(locked), true);
  assert.deepEqual(
    result.json.remnants.map((remnant) => remnant.reason).sort(),
    ['branch-checked-out', 'dirty', 'locked'],
  );

  git(repo.local, 'worktree', 'unlock', locked);
});

test('cleanup refuses a worktree holding commits that exist nowhere else', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  const stage = path.join(repo.local, '.claude/worktrees/agent-unpushed');
  git(repo.local, 'worktree', 'add', '--detach', stage, 'origin/development');
  git(stage, 'config', 'user.email', 'test@example.com');
  git(stage, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(stage, 'NOTES.md'), 'local only\n');
  git(stage, 'add', '-A');
  git(stage, 'commit', '-m', 'local work');

  const result = node(CLEANUP, ['--repo', repo.local, '--path', stage], repo.local);
  assert.equal(result.json.remnants[0].reason, 'unpushed-commits');
  assert.ok(fs.existsSync(stage));
});

test('a clean Codex stage is safely released before a resumed task creates another one', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  const claimed = node(CLAIM, ['--repo', repo.local, 'T100'], repo.local);
  const stage = path.join(repo.local, '.claude/worktrees/codex-ticket-t100-implementer-abc');
  git(repo.local, 'worktree', 'add', '--detach', stage, `origin/${claimed.json.branch}`);
  git(stage, 'checkout', '-B', claimed.json.branch, `origin/${claimed.json.branch}`);

  const result = node(
    CLEANUP,
    ['--repo', repo.local, '--release-codex-stage', '--task', 'T100', '--branch', claimed.json.branch],
    repo.local,
  );
  assert.deepEqual(result.json.removed.map((target) => path.basename(target)), ['codex-ticket-t100-implementer-abc']);
  assert.equal(fs.existsSync(stage), false);
});

test('cleanup never removes the main checkout, even when asked directly', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  const result = node(CLEANUP, ['--repo', repo.local, '--path', repo.local], repo.local);
  assert.equal(result.json.remnants[0].reason, 'main-checkout');
  assert.ok(fs.existsSync(path.join(repo.local, 'TASKS.md')));
});

test('a dry-run claim changes nothing at all', (t) => {
  const repo = makeRepo();
  t.after(() => cleanupRepo(repo));

  const result = node(CLAIM, ['--repo', repo.local, '--dry-run'], repo.local);
  assert.equal(result.json.status, 'claimed');
  assert.equal(result.json.dryRun, true);
  assert.equal(git(repo.local, 'ls-remote', '--heads', 'origin', 'refs/heads/task/*'), '');
  assert.equal(git(repo.local, 'status', '--porcelain'), '');
  assert.equal(git(repo.local, 'worktree', 'list').split('\n').length, 1);
});
