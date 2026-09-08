import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFakeRunner } from '../lib/exec.mjs';
import { claim, parseArgs, remoteClaims } from '../ticket-claim.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TASKS = fs.readFileSync(path.join(here, 'fixtures/TASKS.fixture.md'), 'utf8');
const DONE = fs.readFileSync(path.join(here, 'fixtures/TASKS_DONE.fixture.md'), 'utf8');
const REPO = '/repo';

/** In-memory stand-in for the claim worktree's TASKS.md. */
function fakeFileSystem(initial = TASKS) {
  const written = [];
  return {
    written,
    readFileSync: () => initial,
    writeFileSync: (file, contents) => written.push({ file, contents }),
  };
}

function lsRemote(branches) {
  return branches.map((branch, index) => `${'a'.repeat(39)}${index}\trefs/heads/${branch}`).join('\n');
}

function baseResponses({ branches = [], tasks = TASKS, done = DONE } = {}) {
  return [
    [/^git -C \/repo fetch/, { stdout: '' }],
    [`git -C ${REPO} show origin/development:TASKS.md`, { stdout: tasks }],
    [`git -C ${REPO} show origin/development:TASKS_DONE.md`, { stdout: done }],
    [/ls-remote/, { stdout: lsRemote(branches) }],
    [/show-ref --verify --quiet/, { code: 1 }],
    [/worktree add|switch|add TASKS.md|commit|worktree remove|branch -D|push/, { stdout: '' }],
  ];
}

const options = (overrides = {}) => ({
  taskId: null,
  resume: false,
  ranked: false,
  dryRun: false,
  fetch: true,
  base: 'origin/development',
  repoRoot: REPO,
  json: false,
  ...overrides,
});

test('argument parsing accepts every documented invocation', () => {
  assert.deepEqual(parseArgs([]).taskId, null);
  assert.equal(parseArgs(['T035']).taskId, 'T035');
  assert.equal(parseArgs(['t035']).taskId, 'T035');
  assert.equal(parseArgs(['--task', 'T005.2']).taskId, 'T005.2');

  const resumeWord = parseArgs(['resume', 'T034']);
  assert.equal(resumeWord.resume, true);
  assert.equal(resumeWord.taskId, 'T034');

  const resumeFlag = parseArgs(['T034', '--resume']);
  assert.equal(resumeFlag.resume, true);
  assert.equal(resumeFlag.taskId, 'T034');

  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.throws(() => parseArgs(['resume']), /requires a task ID/);
  assert.throws(() => parseArgs(['--nope']), /unrecognized argument/);

  assert.equal(parseArgs(['ranked']).ranked, true);
  assert.equal(parseArgs(['--ranked']).ranked, true);
  assert.equal(parseArgs([]).ranked, false);
});

test('ranked cannot combine with a named task or resume', () => {
  assert.throws(() => parseArgs(['ranked', 'T035']), /only applies to continuous mode/);
  assert.throws(() => parseArgs(['T035', 'ranked']), /only applies to continuous mode/);
  assert.throws(() => parseArgs(['ranked', 'resume', 'T034']), /cannot combine with resume/);
});

test('remoteClaims groups branches by task ID and ignores non-task refs', () => {
  const run = createFakeRunner([
    [/ls-remote/, { stdout: lsRemote(['task/T100-a', 'task/T104.2-b', 'task/T100-duplicate', 'worktree-agent-x']) }],
  ]);
  const claims = remoteClaims(run, REPO);
  assert.deepEqual(claims.get('T100'), ['task/T100-a', 'task/T100-duplicate']);
  assert.deepEqual(claims.get('T104.2'), ['task/T104.2-b']);
  assert.equal(claims.has('worktree-agent-x'), false);
});

test('dry run reports the decision and touches nothing', () => {
  const run = createFakeRunner(baseResponses());
  const result = claim({ run, repoRoot: REPO, options: options({ dryRun: true }), fileSystem: fakeFileSystem() });
  assert.equal(result.status, 'claimed');
  assert.equal(result.dryRun, true);
  assert.equal(result.taskId, 'T100');
  assert.equal(result.branch, 'task/T100-rename-a-label-on-the-summary-card');
  assert.equal(result.planning.policy, 'implementer');
  assert.equal(result.planExists, false);
  assert.equal(result.planFile, '.claude/plans/T100.md');
  assert.ok(result.entry.startsWith('### [T100]'));
  const joined = run.calls.map((argv) => argv.join(' '));
  assert.equal(joined.some((call) => /worktree add|commit|push/.test(call)), false);
});

test('a fresh claim branches, flips the status, commits and pushes — then cleans up after itself', () => {
  const fileSystem = fakeFileSystem();
  const run = createFakeRunner(baseResponses());
  const result = claim({
    run,
    repoRoot: REPO,
    options: options(),
    fileSystem,
    createClaimNonce: () => 'nonce-one',
  });

  assert.equal(result.status, 'claimed');
  assert.equal(result.branch, 'task/T100-rename-a-label-on-the-summary-card');

  const joined = run.calls.map((argv) => argv.join(' '));
  const order = ['worktree add --detach', 'switch -c task/T100', 'add TASKS.md', 'commit -m', 'push origin'];
  let cursor = -1;
  for (const fragment of order) {
    const index = joined.findIndex((call, position) => position > cursor && call.includes(fragment));
    assert.ok(index > cursor, `expected ${fragment} after position ${cursor}`);
    cursor = index;
  }
  assert.ok(joined.some((call) => call.includes('worktree remove --force')), 'removes its own temporary worktree');
  assert.ok(joined.some((call) => call.includes('Claim-Nonce: nonce-one')), 'claim commit carries a unique nonce');

  // Exactly one status line changes, and the orchestrating checkout is never touched.
  assert.equal(fileSystem.written.length, 1);
  assert.match(fileSystem.written[0].contents, /### \[T100\][\s\S]*?- \*\*Status:\*\* In progress/);
  assert.match(fileSystem.written[0].contents, /### \[T101\][\s\S]*?- \*\*Status:\*\* Not started/);
  for (const call of joined) {
    assert.equal(/^git -C \/repo (checkout|switch|reset|restore|merge)\b/.test(call), false, `mutating call: ${call}`);
  }
});

test('a pre-existing local branch blocks before a worktree is created and is never deleted', () => {
  const run = createFakeRunner([
    ...baseResponses(),
    [/show-ref --verify --quiet/, { code: 0 }],
  ]);
  const result = claim({ run, repoRoot: REPO, options: options(), fileSystem: fakeFileSystem() });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocker.reason, 'local-branch-exists');
  const joined = run.calls.map((argv) => argv.join(' '));
  assert.equal(joined.some((call) => call.includes('worktree add')), false);
  assert.equal(joined.some((call) => call.includes('branch -D')), false);
});

test('a local branch created after preflight is not deleted when switch -c loses the race', () => {
  const run = createFakeRunner([
    ...baseResponses(),
    [/switch -c task\/T100/, { code: 128, stderr: 'fatal: a branch named task/T100 already exists' }],
  ]);
  assert.throws(
    () => claim({ run, repoRoot: REPO, options: options(), fileSystem: fakeFileSystem() }),
    /branch named task\/T100 already exists/,
  );
  const joined = run.calls.map((argv) => argv.join(' '));
  assert.ok(joined.some((call) => call.includes('worktree remove --force')), 'temporary worktree is still removed');
  assert.equal(joined.some((call) => call.includes('branch -D')), false, 'branch created by someone else is preserved');
});

test('claim nonces make otherwise identical concurrent claim commits diverge', () => {
  const commitCalls = [];
  for (const nonce of ['worker-a', 'worker-b']) {
    const run = createFakeRunner(baseResponses());
    claim({
      run,
      repoRoot: REPO,
      options: options(),
      fileSystem: fakeFileSystem(),
      createClaimNonce: () => nonce,
    });
    commitCalls.push(run.calls.find((argv) => argv.includes('commit')).join(' '));
  }
  assert.notEqual(commitCalls[0], commitCalls[1]);
  assert.match(commitCalls[0], /Claim-Nonce: worker-a/);
  assert.match(commitCalls[1], /Claim-Nonce: worker-b/);
});

test('a claim never force-pushes and never deletes a remote branch', () => {
  const run = createFakeRunner(baseResponses());
  claim({ run, repoRoot: REPO, options: options(), fileSystem: fakeFileSystem() });
  for (const call of run.calls.map((argv) => argv.join(' '))) {
    assert.equal(/--force(?!-)/.test(call) && call.includes('push'), false, `force push: ${call}`);
    assert.equal(/--force-with-lease/.test(call), false, `lease push: ${call}`);
    assert.equal(/push .*--delete|push origin :/.test(call), false, `remote delete: ${call}`);
  }
});

test('a named task already claimed by another worker is a blocker with a resume command', () => {
  const run = createFakeRunner(baseResponses({ branches: ['task/T103-rework-the-directory-header'] }));
  const result = claim({ run, repoRoot: REPO, options: options({ taskId: 'T103' }), fileSystem: fakeFileSystem() });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocker.reason, 'claimed');
  assert.equal(result.blocker.resumeCommand, '/newTicket resume T103');
  assert.deepEqual(result.branches, ['task/T103-rework-the-directory-header']);
  assert.equal(run.calls.some((argv) => argv.join(' ').includes('worktree add')), false);
});

test('continuous mode skips a claimed first task and claims the next actionable one', () => {
  const run = createFakeRunner(baseResponses({ branches: ['task/T100-rename-a-label-on-the-summary-card'] }));
  const result = claim({ run, repoRoot: REPO, options: options(), fileSystem: fakeFileSystem() });
  assert.equal(result.status, 'claimed');
  assert.equal(result.taskId, 'T101');
  assert.deepEqual(result.skipped, [
    { id: 'T100', reason: 'claimed', detail: 'already claimed by task/T100-rename-a-label-on-the-summary-card' },
  ]);
});

test('a lost push race is reported as claimed, leaving the winner’s branch alone', () => {
  let lsRemoteCalls = 0;
  const run = createFakeRunner([
    ...baseResponses(),
    [
      /ls-remote/,
      () => {
        lsRemoteCalls += 1;
        return { stdout: lsRemoteCalls === 1 ? '' : lsRemote(['task/T100-someone-else']) };
      },
    ],
    [/push origin/, { code: 1, stderr: 'rejected: non-fast-forward' }],
  ]);
  const result = claim({ run, repoRoot: REPO, options: options(), fileSystem: fakeFileSystem() });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocker.reason, 'claimed');
  assert.match(result.blocker.detail, /another worker claimed T100 first/);
  const joined = run.calls.map((argv) => argv.join(' '));
  assert.equal(joined.some((call) => call.includes('push') && call.includes('--force')), false);
  assert.ok(joined.some((call) => call.includes('worktree remove --force')), 'still cleans up its worktree');
});

test('a push failure with no competing branch is reported as push-failed, not as a claim', () => {
  const run = createFakeRunner([...baseResponses(), [/push origin/, { code: 1, stderr: 'network unreachable' }]]);
  const result = claim({ run, repoRoot: REPO, options: options(), fileSystem: fakeFileSystem() });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocker.reason, 'push-failed');
  assert.match(result.blocker.detail, /network unreachable/);
});

test('ranked mode claims the highest-value actionable task instead of the first one in file order', () => {
  const fileOrder = claim({ run: createFakeRunner(baseResponses()), repoRoot: REPO, options: options(), fileSystem: fakeFileSystem() });
  assert.equal(fileOrder.taskId, 'T100');
  assert.equal(fileOrder.ranked, false);
  assert.equal(fileOrder.unblockFanOut, undefined, 'fan-out is only reported in ranked mode');

  // T104.1 has the highest fan-out in the fixture (T104.2 and T108 both name
  // it) and is itself actionable — a plain leaf, not the umbrella T104 — so
  // ranked mode picks it over file-order's T100.
  const ranked = claim({
    run: createFakeRunner(baseResponses()),
    repoRoot: REPO,
    options: options({ ranked: true }),
    fileSystem: fakeFileSystem(),
  });
  assert.equal(ranked.taskId, 'T104.1');
  assert.equal(ranked.ranked, true);
  assert.equal(ranked.unblockFanOut, 2);
});

test('an exhausted backlog is reported as backlog-exhausted, not blocked', () => {
  const onlyBlocked = TASKS.replace(/- \*\*Status:\*\* Not started/g, '- **Status:** Done');
  const run = createFakeRunner(baseResponses({ tasks: onlyBlocked }));
  const result = claim({ run, repoRoot: REPO, options: options(), fileSystem: fakeFileSystem() });
  assert.equal(result.status, 'backlog-exhausted');
  assert.ok(result.skipped.length > 0);
});

function resumeResponses({ branches, tasks = TASKS, planExists }) {
  return [
    [/ls-remote/, { stdout: lsRemote(branches) }],
    [/^git -C \/repo fetch/, { stdout: '' }],
    [/rev-parse FETCH_HEAD/, { stdout: 'deadbeef\n' }],
    [/show deadbeef:TASKS\.md/, { stdout: tasks }],
    [/show deadbeef:TASKS_DONE\.md/, { stdout: DONE }],
    [/cat-file -e/, { code: planExists ? 0 : 1 }],
  ];
}

test('resume with a durable plan skips planning', () => {
  const run = createFakeRunner(
    resumeResponses({ branches: ['task/T101-add-a-derived-summary'], planExists: true }),
  );
  const result = claim({ run, repoRoot: REPO, options: options({ taskId: 'T101', resume: true }) });
  assert.equal(result.status, 'resumed');
  assert.equal(result.branch, 'task/T101-add-a-derived-summary');
  assert.equal(result.planExists, true);
  assert.equal(result.planning.policy, 'implementer');
  assert.equal(result.planning.source, 'existing-plan');
  const joined = run.calls.map((argv) => argv.join(' '));
  assert.equal(joined.some((call) => /worktree add|commit|push|switch -c/.test(call)), false, 'resume never writes');
});

test('resume without a plan falls back to the task’s planning policy', () => {
  const withPlan = createFakeRunner(
    resumeResponses({ branches: ['task/T101-add-a-derived-summary'], planExists: false }),
  );
  const unannotated = claim({ run: withPlan, repoRoot: REPO, options: options({ taskId: 'T101', resume: true }) });
  assert.equal(unannotated.planExists, false);
  assert.equal(unannotated.planning.policy, 'required');
  assert.equal(unannotated.planning.source, 'default');

  const annotated = createFakeRunner(
    resumeResponses({ branches: ['task/T100-rename-a-label-on-the-summary-card'], planExists: false }),
  );
  const implementer = claim({ run: annotated, repoRoot: REPO, options: options({ taskId: 'T100', resume: true }) });
  assert.equal(implementer.planning.policy, 'implementer');
  assert.equal(implementer.planning.source, 'field');
});

test('resume refuses when several branches match the task', () => {
  const run = createFakeRunner(
    resumeResponses({ branches: ['task/T101-add-a-derived-summary', 'task/T101-retry'], planExists: true }),
  );
  const result = claim({ run, repoRoot: REPO, options: options({ taskId: 'T101', resume: true }) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocker.reason, 'ambiguous-claim-branches');
  assert.deepEqual(result.branches, ['task/T101-add-a-derived-summary', 'task/T101-retry']);
});

test('resume refuses when no branch matches the task', () => {
  const run = createFakeRunner(resumeResponses({ branches: ['task/T103-other'], planExists: false }));
  const result = claim({ run, repoRoot: REPO, options: options({ taskId: 'T101', resume: true }) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocker.reason, 'no-claim-branch');
});

test('resume refuses a branch whose backlog no longer holds the task', () => {
  const withoutTask = TASKS.replace(/### \[T101\][\s\S]*?(?=### \[T102\])/, '');
  const run = createFakeRunner(
    resumeResponses({ branches: ['task/T101-add-a-derived-summary'], tasks: withoutTask, planExists: true }),
  );
  const result = claim({ run, repoRoot: REPO, options: options({ taskId: 'T101', resume: true }) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocker.reason, 'branch-mismatch');
});
