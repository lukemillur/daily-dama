import test from 'node:test';
import assert from 'node:assert/strict';

import { createFakeRunner } from '../lib/exec.mjs';
import { assessWorktree, parseWorktreeList, removeWorktree } from '../lib/worktree.mjs';
import { cleanup, parseArgs } from '../worktree-cleanup.mjs';

const REPO = '/repo';
const WT = '/repo/.claude/worktrees/agent-abc123';

const PORCELAIN = [
  `worktree ${REPO}`,
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/development',
  '',
  `worktree ${WT}`,
  'HEAD 2222222222222222222222222222222222222222',
  'detached',
  '',
  'worktree /repo/.claude/worktrees/agent-locked',
  'HEAD 3333333333333333333333333333333333333333',
  'detached',
  'locked agent session in progress',
  '',
  'worktree /repo/.claude/worktrees/agent-onbranch',
  'HEAD 4444444444444444444444444444444444444444',
  'branch refs/heads/task/T100-something',
  '',
  'worktree /Users/luke/elsewhere/manual-worktree',
  'HEAD 5555555555555555555555555555555555555555',
  'detached',
  '',
].join('\n');

const worktrees = parseWorktreeList(PORCELAIN);
const find = (needle) => worktrees.find((worktree) => worktree.path.includes(needle));

const cleanResponses = [
  [/status --porcelain/, { stdout: '' }],
  [/rev-list --count/, { stdout: '0\n' }],
  [/^lsof/, { code: 1, stdout: '' }],
  [/worktree remove/, { stdout: '' }],
  [/worktree list --porcelain/, { stdout: PORCELAIN }],
];

test('parses git worktree list --porcelain, including lock reasons', () => {
  assert.equal(worktrees.length, 5);
  assert.equal(worktrees[0].main, true);
  assert.equal(worktrees[0].branch, 'refs/heads/development');
  assert.equal(find('agent-abc123').detached, true);
  assert.equal(find('agent-locked').locked, true);
  assert.equal(find('agent-locked').lockReason, 'agent session in progress');
  assert.equal(find('agent-onbranch').branch, 'refs/heads/task/T100-something');
  assert.equal(find('agent-onbranch').detached, false);
});

test('a finished, clean, pushed, detached workflow worktree is removable', () => {
  const run = createFakeRunner(cleanResponses);
  const assessment = assessWorktree({ run, repoRoot: REPO, worktree: find('agent-abc123') });
  assert.equal(assessment.safe, true);
});

test('refuses the main checkout', () => {
  const run = createFakeRunner(cleanResponses);
  const assessment = assessWorktree({ run, repoRoot: REPO, worktree: worktrees[0] });
  assert.equal(assessment.safe, false);
  assert.equal(assessment.reason, 'main-checkout');
});

test('refuses a locked worktree — the lock means an agent still holds it', () => {
  const run = createFakeRunner(cleanResponses);
  const assessment = assessWorktree({ run, repoRoot: REPO, worktree: find('agent-locked') });
  assert.equal(assessment.safe, false);
  assert.equal(assessment.reason, 'locked');
});

test('refuses a worktree that still has a branch checked out', () => {
  const run = createFakeRunner(cleanResponses);
  const assessment = assessWorktree({ run, repoRoot: REPO, worktree: find('agent-onbranch') });
  assert.equal(assessment.safe, false);
  assert.equal(assessment.reason, 'branch-checked-out');
});

test('refuses a worktree outside .claude/worktrees as user-owned', () => {
  const run = createFakeRunner(cleanResponses);
  const assessment = assessWorktree({ run, repoRoot: REPO, worktree: find('elsewhere') });
  assert.equal(assessment.safe, false);
  assert.equal(assessment.reason, 'outside-container');
});

test('refuses a worktree with uncommitted or untracked files', () => {
  const run = createFakeRunner([...cleanResponses, [/status --porcelain/, { stdout: '?? scratch.txt\n' }]]);
  const assessment = assessWorktree({ run, repoRoot: REPO, worktree: find('agent-abc123') });
  assert.equal(assessment.safe, false);
  assert.equal(assessment.reason, 'dirty');
});

test('refuses a worktree holding commits that exist nowhere else', () => {
  const run = createFakeRunner([...cleanResponses, [/rev-list --count/, { stdout: '2\n' }]]);
  const assessment = assessWorktree({ run, repoRoot: REPO, worktree: find('agent-abc123') });
  assert.equal(assessment.safe, false);
  assert.equal(assessment.reason, 'unpushed-commits');
});

test('refuses a worktree with a live process inside it', () => {
  const run = createFakeRunner([
    ...cleanResponses,
    [/^lsof/, { code: 0, stdout: `p4242\nfcwd\nn${WT}/src/features\n` }],
  ]);
  const assessment = assessWorktree({ run, repoRoot: REPO, worktree: find('agent-abc123') });
  assert.equal(assessment.safe, false);
  assert.equal(assessment.reason, 'active-process');
  assert.match(assessment.detail, /src\/features/);
});

test('refuses when lsof is unavailable or fails unexpectedly', () => {
  const run = createFakeRunner([
    ...cleanResponses,
    [/^lsof/, { code: 1, stdout: '', stderr: 'spawn lsof ENOENT' }],
  ]);
  const assessment = assessWorktree({ run, repoRoot: REPO, worktree: find('agent-abc123') });
  assert.equal(assessment.safe, false);
  assert.equal(assessment.reason, 'unverifiable');
  assert.match(assessment.detail, /lsof failed/);
});

test('refuses when git itself cannot answer', () => {
  const run = createFakeRunner([...cleanResponses, [/status --porcelain/, { code: 128, stderr: 'not a git repo' }]]);
  const assessment = assessWorktree({ run, repoRoot: REPO, worktree: find('agent-abc123') });
  assert.equal(assessment.safe, false);
  assert.equal(assessment.reason, 'unverifiable');
});

test('removal never passes --force', () => {
  const run = createFakeRunner(cleanResponses);
  const result = removeWorktree({ run, repoRoot: REPO, worktree: find('agent-abc123') });
  assert.equal(result.action, 'removed');
  const removeCall = run.calls.find((argv) => argv.includes('remove'));
  assert.deepEqual(removeCall, ['git', '-C', REPO, 'worktree', 'remove', WT]);
});

test('dry run reports the decision without running the removal', () => {
  const run = createFakeRunner(cleanResponses);
  const result = removeWorktree({ run, repoRoot: REPO, worktree: find('agent-abc123'), dryRun: true });
  assert.equal(result.action, 'would-remove');
  assert.equal(run.calls.some((argv) => argv.includes('remove')), false);
});

test('a failed removal is reported, not retried with force', () => {
  const run = createFakeRunner([...cleanResponses, [/worktree remove/, { code: 1, stderr: 'is dirty' }]]);
  const result = removeWorktree({ run, repoRoot: REPO, worktree: find('agent-abc123') });
  assert.equal(result.action, 'failed');
  assert.equal(run.calls.filter((argv) => argv.includes('remove')).length, 1);
});

test('CLI argument parsing', () => {
  const parsed = parseArgs(['--path', '/a', '--path', '/b', '--prefix', 'newticket-claim-', '--dry-run']);
  assert.deepEqual(parsed.paths, ['/a', '/b']);
  assert.deepEqual(parsed.prefixes, ['newticket-claim-']);
  assert.equal(parsed.dryRun, true);
  assert.equal(parseArgs(['--list']).list, true);
  assert.throws(() => parseArgs([]), /nothing to do/);
});

test('cleanup by path removes only the named worktree', () => {
  const run = createFakeRunner(cleanResponses);
  const result = cleanup({ run, repoRoot: REPO, options: parseArgs(['--path', WT, '--repo', REPO]) });
  assert.equal(result.status, 'clean');
  assert.deepEqual(result.removed, [WT]);
  assert.equal(run.calls.filter((argv) => argv.includes('remove')).length, 1);
});

test('cleanup reports an unknown path as skipped rather than failing', () => {
  const run = createFakeRunner(cleanResponses);
  const result = cleanup({
    run,
    repoRoot: REPO,
    options: parseArgs(['--path', '/repo/.claude/worktrees/already-gone']),
  });
  assert.equal(result.results[0].action, 'skipped');
  assert.equal(result.results[0].reason, 'not-a-worktree');
});

test('cleanup by path keeps a worktree that fails any check and reports it as a remnant', () => {
  const run = createFakeRunner(cleanResponses);
  const result = cleanup({
    run,
    repoRoot: REPO,
    options: parseArgs(['--path', '/repo/.claude/worktrees/agent-locked']),
  });
  assert.equal(result.status, 'remnants');
  assert.equal(result.remnants[0].reason, 'locked');
  assert.deepEqual(result.removed, []);
});

test('cleanup by prefix only matches this workflow’s own worktrees', () => {
  const porcelain = [
    PORCELAIN,
    'worktree /repo/.claude/worktrees/newticket-claim-T100-1-abc',
    'HEAD 6666666666666666666666666666666666666666',
    'detached',
    '',
  ].join('\n');
  const run = createFakeRunner([...cleanResponses, [/worktree list --porcelain/, { stdout: porcelain }]]);
  const result = cleanup({ run, repoRoot: REPO, options: parseArgs(['--prefix', 'newticket-claim-']) });
  assert.deepEqual(result.removed, ['/repo/.claude/worktrees/newticket-claim-T100-1-abc']);
});

test('list mode inspects without removing anything', () => {
  const run = createFakeRunner(cleanResponses);
  const result = cleanup({ run, repoRoot: REPO, options: parseArgs(['--list']) });
  assert.equal(result.status, 'listed');
  assert.equal(result.worktrees.length, 5);
  assert.equal(result.worktrees[0].reason, 'main-checkout');
  assert.equal(run.calls.some((argv) => argv.includes('remove')), false);
});
