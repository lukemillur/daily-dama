import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  branchNameFor,
  childrenOf,
  isUmbrella,
  parseBacklog,
  parseDoneIds,
  resolvePlanningPolicy,
  selectTask,
  setTaskStatus,
  slugify,
  taskIdFromBranch,
} from '../lib/tasks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TASKS = fs.readFileSync(path.join(here, 'fixtures/TASKS.fixture.md'), 'utf8');
const DONE = fs.readFileSync(path.join(here, 'fixtures/TASKS_DONE.fixture.md'), 'utf8');
const REAL_TASKS = fs.readFileSync(path.join(here, '../../../TASKS.md'), 'utf8');

const tasks = parseBacklog(TASKS);
const doneIds = parseDoneIds(DONE);
const byId = (id) => tasks.find((task) => task.id === id);
const noClaims = new Map();

test('parses only [T###] headings from the Backlog section', () => {
  assert.deepEqual(
    tasks.map((task) => task.id),
    ['T100', 'T101', 'T102', 'T103', 'T104', 'T104.1', 'T104.2', 'T105', 'T106'],
  );
  assert.equal(byId('T100').title, 'Rename a label on the summary card');
  assert.equal(byId('T100').status, 'Not started');
  assert.equal(byId('T106').status, 'Blocked');
});

test('captures the verbatim entry and its fields', () => {
  const entry = byId('T101').entry;
  assert.ok(entry.startsWith('### [T101] Add a derived summary'));
  assert.ok(entry.includes('- **Exit criteria:** Unit tests cover empty and populated input.'));
  assert.ok(!entry.includes('### [T102]'));
  assert.equal(byId('T101').fields.Area, 'Stats');
  assert.equal(byId('T101').fields.Priority, 'High');
});

test('ignores Needs scoping and Done sections', () => {
  assert.equal(tasks.some((task) => /vague/i.test(task.title)), false);
});

test('detects umbrella parents and their children', () => {
  assert.equal(isUmbrella(byId('T104'), tasks), true);
  assert.equal(isUmbrella(byId('T104.1'), tasks), false);
  assert.equal(isUmbrella(byId('T101'), tasks), false, 'a leaf task with exit criteria is not an umbrella');
  assert.deepEqual(childrenOf(byId('T104'), tasks).map((task) => task.id), ['T104.1', 'T104.2']);
});

test('extracts stated dependencies', () => {
  assert.deepEqual(byId('T104.2').dependsOn, ['T104.1']);
  assert.deepEqual(byId('T105').dependsOn, ['T900']);
  assert.deepEqual(byId('T101').dependsOn, []);
});

test('parses done IDs and respects a non-Done archived status', () => {
  assert.equal(doneIds.has('T099'), true);
  assert.equal(doneIds.has('T098'), false, 'archived but not Done must not satisfy a dependency');
  assert.equal(doneIds.has('T104.1'), false);
});

test('an archived entry without an explicit Done status does not satisfy dependencies', () => {
  const malformed = [
    '# Tasks — Done Archive',
    '',
    '### [T777] Missing status',
    '',
    '- **Description:** This entry is malformed.',
  ].join('\n');
  assert.equal(parseDoneIds(malformed).has('T777'), false);
});

test('planning policy: explicit Implementer skips the separate planner', () => {
  const policy = resolvePlanningPolicy(byId('T100'));
  assert.equal(policy.policy, 'implementer');
  assert.equal(policy.source, 'field');
});

test('planning policy: explicit Required uses the separate planner', () => {
  const policy = resolvePlanningPolicy(byId('T103'));
  assert.equal(policy.policy, 'required');
  assert.equal(policy.source, 'field');
});

test('planning policy: an unannotated task defaults to the separate planner', () => {
  const policy = resolvePlanningPolicy(byId('T101'));
  assert.equal(policy.policy, 'required');
  assert.equal(policy.source, 'default');
});

test('planning policy: priority never implies complexity', () => {
  // T101 is High priority and T100 is Low; the field, not the priority, decides.
  assert.equal(resolvePlanningPolicy(byId('T101')).policy, 'required');
  assert.equal(resolvePlanningPolicy(byId('T100')).policy, 'implementer');
});

test('planning policy: persistence work marked Implementer is escalated', () => {
  const policy = resolvePlanningPolicy(byId('T102'));
  assert.equal(policy.policy, 'required');
  assert.equal(policy.source, 'escalated');
  assert.match(policy.reason, /persistence/);
});

test('planning policy: documenting persistence and explicitly avoiding new persistence do not escalate', () => {
  const documentation = {
    ...byId('T100'),
    title: 'Document local setup',
    fields: {
      ...byId('T100').fields,
      Area: 'Repository documentation',
      Description: 'Explain the existing local-first persistence domains.',
      Notes: 'Do not add new persistence in this task.',
    },
  };
  const policy = resolvePlanningPolicy(documentation);
  assert.equal(policy.policy, 'implementer');
  assert.equal(policy.source, 'field');
});

test('planning policy: an actual persisted-shape change still escalates outside a persistence area', () => {
  const change = {
    ...byId('T100'),
    fields: {
      ...byId('T100').fields,
      Area: 'Profile',
      Description: 'Change the persisted profile shape to add a new field.',
    },
  };
  const policy = resolvePlanningPolicy(change);
  assert.equal(policy.policy, 'required');
  assert.equal(policy.source, 'escalated');
});

test('planning policy: an unrecognized value falls back to the separate planner', () => {
  const task = { ...byId('T100'), fields: { ...byId('T100').fields, Planning: 'maybe' } };
  const policy = resolvePlanningPolicy(task);
  assert.equal(policy.policy, 'required');
  assert.equal(policy.source, 'default');
});

test('every entry in the real TASKS.md backlog resolves to a policy', () => {
  const real = parseBacklog(REAL_TASKS);
  assert.ok(real.length > 0, 'the real backlog should parse');
  for (const task of real) {
    const policy = resolvePlanningPolicy(task);
    assert.ok(['required', 'implementer'].includes(policy.policy), `${task.id} resolved to ${policy.policy}`);
  }
  const actionable = real.filter((task) => task.fields['Exit criteria']);
  assert.deepEqual(
    actionable.filter((task) => !task.fields.Planning).map((task) => task.id),
    [],
    'every actionable backlog entry must make its planning cost explicit',
  );

  const unannotated = real.filter((task) => !task.fields.Planning);
  assert.ok(unannotated.length > 0, 'umbrella entries may omit the Planning field');
  for (const task of unannotated) {
    assert.equal(resolvePlanningPolicy(task).policy, 'required', `${task.id} must stay on the separate planner`);
  }
});

test('slugs are kebab-case and truncate on a word boundary', () => {
  assert.equal(slugify('Add a global notes archive'), 'add-a-global-notes-archive');
  assert.equal(
    slugify('Align Kentei assessment language with promotion-only behavior'),
    'align-kentei-assessment-language-with',
  );
  assert.ok(slugify('Align Kentei assessment language with promotion-only behavior').length <= 40);
  assert.equal(slugify('Prevent mobile keyboards from obscuring form actions!!'), 'prevent-mobile-keyboards-from-obscuring');
  assert.equal(slugify('   '), 'task');
  assert.equal(slugify('Supercalifragilisticexpialidociousandthensomeextra'), 'supercalifragilisticexpialidociousandthe');
});

test('branch names and reverse lookup round-trip', () => {
  assert.equal(branchNameFor(byId('T104.2')), 'task/T104.2-add-the-second-flow-step');
  assert.equal(taskIdFromBranch('task/T104.2-add-the-second-flow-step'), 'T104.2');
  assert.equal(taskIdFromBranch('refs/heads/task/T035-add-a-global-notes-archive'), 'T035');
  assert.equal(taskIdFromBranch('development'), null);
  assert.equal(taskIdFromBranch('worktree-agent-abc123'), null);
});

test('setTaskStatus rewrites exactly one status line', () => {
  const updated = setTaskStatus(TASKS, 'T101', 'In progress');
  const reparsed = parseBacklog(updated);
  assert.equal(reparsed.find((task) => task.id === 'T101').status, 'In progress');
  for (const task of reparsed.filter((entry) => entry.id !== 'T101')) {
    assert.equal(task.status, byId(task.id).status, `${task.id} must be untouched`);
  }
  assert.equal(updated.split('\n').length, TASKS.split('\n').length, 'no lines added or removed');
});

test('setTaskStatus refuses to silently no-op', () => {
  assert.throws(() => setTaskStatus(TASKS, 'T999', 'In progress'), /not found/);
});

test('selection: picks the first actionable Not started entry', () => {
  const result = selectTask({ tasks, doneIds, claimedBranches: noClaims });
  assert.equal(result.status, 'selected');
  assert.equal(result.task.id, 'T100');
});

test('selection: skips umbrella parents and reaches their children in file order', () => {
  const subset = tasks.filter((task) => ['T104', 'T104.1', 'T104.2'].includes(task.id));
  const result = selectTask({ tasks: subset, doneIds, claimedBranches: noClaims });
  assert.equal(result.task.id, 'T104.1');
  assert.ok(result.skipped.some((entry) => entry.id === 'T104' && entry.reason === 'umbrella'));
});

test('selection: skips a task whose dependency is not archived', () => {
  const subset = [byId('T104.2'), byId('T103')];
  const result = selectTask({ tasks: subset, doneIds, claimedBranches: noClaims });
  assert.equal(result.task.id, 'T103');
  assert.deepEqual(
    result.skipped.map((entry) => [entry.id, entry.reason]),
    [['T104.2', 'dependency']],
  );
});

test('selection: a satisfied dependency stops being a blocker', () => {
  const subset = tasks.filter((task) => task.id === 'T104.2');
  const satisfied = new Set([...doneIds, 'T104.1']);
  const result = selectTask({ tasks: subset, doneIds: satisfied, claimedBranches: noClaims });
  assert.equal(result.status, 'selected');
  assert.equal(result.task.id, 'T104.2');
});

test('selection: skips entries that are not Not started', () => {
  const subset = [byId('T106'), byId('T103')];
  const result = selectTask({ tasks: subset, doneIds, claimedBranches: noClaims });
  assert.equal(result.task.id, 'T103');
  assert.deepEqual(result.skipped.map((entry) => entry.reason), ['status']);
});

test('selection: a claimed next task stops the scan instead of being skipped', () => {
  const claimed = new Map([['T100', ['task/T100-rename-a-label-on-the-summary-card']]]);
  const result = selectTask({ tasks, doneIds, claimedBranches: claimed });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocker.reason, 'claimed');
  assert.equal(result.blocker.taskId, 'T100');
});

test('selection: an exhausted backlog is not a blocker', () => {
  const result = selectTask({ tasks: [byId('T106')], doneIds, claimedBranches: noClaims });
  assert.equal(result.status, 'backlog-exhausted');
});

test('selection: a named task is looked up directly', () => {
  const result = selectTask({ tasks, doneIds, claimedBranches: noClaims, requestedId: 'T103' });
  assert.equal(result.status, 'selected');
  assert.equal(result.task.id, 'T103');
  assert.equal(result.resolvedFromParent, false);
});

test('selection: a named umbrella resolves to its first actionable child', () => {
  const result = selectTask({ tasks, doneIds, claimedBranches: noClaims, requestedId: 'T104' });
  assert.equal(result.status, 'selected');
  assert.equal(result.task.id, 'T104.1');
  assert.equal(result.resolvedFromParent, true);
});

test('selection: a named umbrella with no actionable child is a blocker', () => {
  const subset = tasks.filter((task) => ['T104', 'T104.2'].includes(task.id));
  const result = selectTask({ tasks: subset, doneIds, claimedBranches: noClaims, requestedId: 'T104' });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocker.reason, 'umbrella-no-actionable-child');
});

test('selection: a named unknown / blocked / dependent / claimed task each reports its own reason', () => {
  const unknown = selectTask({ tasks, doneIds, claimedBranches: noClaims, requestedId: 'T999' });
  assert.equal(unknown.blocker.reason, 'not-found');

  const blockedStatus = selectTask({ tasks, doneIds, claimedBranches: noClaims, requestedId: 'T106' });
  assert.equal(blockedStatus.blocker.reason, 'status');

  const dependency = selectTask({ tasks, doneIds, claimedBranches: noClaims, requestedId: 'T105' });
  assert.equal(dependency.blocker.reason, 'dependency');
  assert.match(dependency.blocker.detail, /T900/);

  const claimed = selectTask({
    tasks,
    doneIds,
    claimedBranches: new Map([['T103', ['task/T103-rework-the-directory-header']]]),
    requestedId: 'T103',
  });
  assert.equal(claimed.blocker.reason, 'claimed');
});
