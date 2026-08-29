import test from 'node:test';
import assert from 'node:assert/strict';

import { createFakeRunner } from '../lib/exec.mjs';
import { assessWorktree, parseWorktreeList, releaseAttachedWorktree, removeWorktree } from '../lib/worktree.mjs';
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

test('releases only a clean, pushed Codex stage on its exact task branch', () => {
  const stage = find('agent-onbranch');
  const run = createFakeRunner([
    ...cleanResponses,
    [/checkout --detach HEAD/, { stdout: '' }],
    [/worktree list --porcelain/, { stdout: PORCELAIN.replace('branch refs/heads/task/T100-something', 'detached') }],
  ]);
  const result = releaseAttachedWorktree({ run, repoRoot: REPO, worktree: stage, branch: 'task/T100-something' });
  assert.equal(result.action, 'removed');
  assert.ok(run.calls.some((argv) => argv.join(' ') === `git -C ${stage.path} checkout --detach HEAD`));
});

test('refuses to release a stage when a different branch is attached', () => {
  const run = createFakeRunner(cleanResponses);
  const result = releaseAttachedWorktree({
    run,
    repoRoot: REPO,
    worktree: find('agent-onbranch'),
    branch: 'task/T100-other',
  });
  assert.equal(result.action, 'refused');
  assert.equal(result.reason, 'unexpected-branch');
  assert.equal(run.calls.some((argv) => argv.includes('checkout')), false);
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

test('canonical merged PR head permits release after its remote branch was deleted', () => {
  const stage = find('agent-onbranch');
  const detached = PORCELAIN.replace('branch refs/heads/task/T100-something', 'detached');
  const run = createFakeRunner([
    ...cleanResponses,
    [/rev-list --count/, { stdout: '1\n' }],
    [/checkout --detach HEAD/, { stdout: '' }],
    [/worktree list --porcelain/, { stdout: detached }],
  ]);
  const result = releaseAttachedWorktree({
    run,
    repoRoot: REPO,
    worktree: stage,
    branch: 'task/T100-something',
    mergedHead: stage.head,
  });
  assert.equal(result.action, 'removed', JSON.stringify(result));
  assert.match(result.detail, /canonical merged PR/);
});

test('canonical merged PR evidence refuses a mismatched worktree head', () => {
  const run = createFakeRunner([...cleanResponses, [/rev-list --count/, { stdout: '1\n' }]]);
  const result = releaseAttachedWorktree({
    run,
    repoRoot: REPO,
    worktree: find('agent-onbranch'),
    branch: 'task/T100-something',
    mergedHead: 'different-head',
  });
  assert.equal(result.action, 'refused');
  assert.equal(result.reason, 'unpushed-commits');
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
  const release = parseArgs(['--release-codex-stage', '--task', 'T100.1', '--branch', 'task/T100.1-safe-release']);
  assert.equal(release.releaseCodexStage, true);
  assert.equal(release.task, 'T100.1');
  const mergedRelease = parseArgs(['--release-codex-stage', '--task', 'T100', '--branch', 'task/T100-safe-release', '--merged-pr', 'https://github.com/example/repo/pull/1']);
  assert.equal(mergedRelease.mergedPr, 'https://github.com/example/repo/pull/1');
  assert.throws(() => parseArgs(['--merged-pr', 'https://github.com/example/repo/pull/1', '--path', WT]), /requires --release/);
  assert.throws(() => parseArgs(['--release-codex-stage', '--task', 'T100']), /requires a valid/);
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

test('release-codex-stage ignores non-Codex worktrees and removes only the matching task stage', () => {
  const codex = '/repo/.claude/worktrees/codex-ticket-t100-implementer-abc';
  const porcelain = [
    PORCELAIN,
    `worktree ${codex}`,
    'HEAD 7777777777777777777777777777777777777777',
    'branch refs/heads/task/T100-something',
    '',
  ].join('\n');
  const detached = porcelain.replaceAll('branch refs/heads/task/T100-something', 'detached');
  const run = createFakeRunner([
    ...cleanResponses,
    [/worktree list --porcelain/, () => ({ stdout: run.calls.filter((argv) => argv.includes('worktree') && argv.includes('list')).length > 1 ? detached : porcelain })],
    [/checkout --detach HEAD/, { stdout: '' }],
  ]);
  const result = cleanup({
    run,
    repoRoot: REPO,
    options: parseArgs(['--release-codex-stage', '--task', 'T100', '--branch', 'task/T100-something']),
  });
  assert.deepEqual(result.removed, [codex]);
  assert.equal(run.calls.some((argv) => argv.join(' ').includes('agent-onbranch checkout --detach')), false);
});

test('release-codex-stage accepts only matching canonical merged PR head after remote deletion', () => {
  const codex = '/repo/.claude/worktrees/codex-ticket-t100-implementer-merged';
  const codexRecord = [
    `worktree ${codex}`,
    'HEAD 7777777777777777777777777777777777777777',
    'branch refs/heads/task/T100-something',
    '',
  ].join('\n');
  const porcelain = `${PORCELAIN}\n${codexRecord}`;
  const detached = porcelain.replace(codexRecord, codexRecord.replace('branch refs/heads/task/T100-something', 'detached'));
  const run = createFakeRunner([
    ...cleanResponses,
    [/gh pr view/, { stdout: JSON.stringify({
      state: 'MERGED',
      mergedAt: '2026-08-28T19:00:13Z',
      mergeCommit: { oid: 'merge-sha' },
      headRefOid: '7777777777777777777777777777777777777777',
      url: 'https://github.com/example/repo/pull/1',
    }) }],
    [/rev-list --count/, { stdout: '1\n' }],
    [/checkout --detach HEAD/, { stdout: '' }],
    [/worktree list --porcelain/, () => ({
      stdout: run.calls.filter((argv) => argv.includes('worktree') && argv.includes('list')).length > 1 ? detached : porcelain,
    })],
  ]);
  const result = cleanup({
    run,
    repoRoot: REPO,
    options: parseArgs([
      '--release-codex-stage',
      '--task',
      'T100',
      '--branch',
      'task/T100-something',
      '--merged-pr',
      'https://github.com/example/repo/pull/1',
    ]),
  });
  assert.deepEqual(result.removed, [codex]);
  assert.match(result.results[0].detail, /canonical merged PR/);
});

test('list mode inspects without removing anything', () => {
  const run = createFakeRunner(cleanResponses);
  const result = cleanup({ run, repoRoot: REPO, options: parseArgs(['--list']) });
  assert.equal(result.status, 'listed');
  assert.equal(result.worktrees.length, 5);
  assert.equal(result.worktrees[0].reason, 'main-checkout');
  assert.equal(run.calls.some((argv) => argv.includes('remove')), false);
});
