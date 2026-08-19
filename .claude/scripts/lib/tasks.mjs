// TASKS.md / TASKS_DONE.md parsing and task selection.
//
// Pure functions over file *contents* — no filesystem, no git, no network — so
// selection, dependency handling, slugging, status changes and the planning
// policy are all directly testable.

const ENTRY_HEADING = /^### \[(T\d+(?:\.\d+)?)\]\s*(.*)$/;
const FIELD = /^- \*\*([A-Za-z][A-Za-z ]*):\*\*\s*(.*)$/;
const DEPENDS_ON = /\bdepends on\s+(T\d+(?:\.\d+)?)/gi;

/** Planning policies. `required` runs the separate ticket-planner stage. */
export const PLANNING_REQUIRED = 'required';
export const PLANNING_IMPLEMENTER = 'implementer';

/**
 * Signals that force the higher-rigor separate planner even when a task is
 * annotated `Planning: Implementer`. These are the categories AGENTS.md treats
 * as architecturally load-bearing; a mis-annotated ticket in one of them should
 * cost an extra planning pass rather than get planned inline.
 *
 * Escalation is one-directional: it can only add rigor, never remove it.
 */
const AREA_ESCALATION_SIGNALS = [
  { pattern: /\bpersist(ence|ed|ing)?\b|\basync ?storage\b|\bstorage contract\b/i, reason: 'persistence' },
  { pattern: /\bschema\b|\bmigration\b/i, reason: 'schema' },
  { pattern: /\breducer\b|\bstate machine\b|\bconcurren(t|cy)\b/i, reason: 'state-machine/concurrency' },
  { pattern: /\barchitectur(e|al)\b|\bdomain boundar(y|ies)\b/i, reason: 'architecture boundary' },
  { pattern: /\bnative\b|\bios\b|\bandroid\b|\bplatform api\b/i, reason: 'native/platform API' },
];

const SUMMARY_ESCALATION_SIGNALS = [
  {
    pattern:
      /\b(?:add|change|modify|update|introduce|migrate|restore|hydrate|validate|write|store|persist)\w*\b.{0,60}\b(?:persistence|async ?storage|storage contract|persisted(?:\s+[\w-]+){0,2}\s+(?:key|shape|field))\b|\b(?:persistence|async ?storage|storage contract|persisted(?:\s+[\w-]+){0,2}\s+(?:key|shape|field))\b.{0,60}\b(?:add|change|modify|update|introduce|migrate|restore|hydrate|validate|write|store|persist)\w*\b/i,
    reason: 'persistence/schema',
  },
  { pattern: /\bschema\b|\bmigration\b|\breducer\b|\bstate machine\b|\bconcurren(t|cy)\b|\brace condition\b/i, reason: 'state-machine/concurrency' },
  { pattern: /\bdomain boundar(y|ies)\b|\barchitectur(e|al)\b|\bprovider setup\b/i, reason: 'architecture boundary' },
  { pattern: /\bnative\b|\bios\b|\bandroid\b|\bplatform api\b/i, reason: 'native/platform API' },
];

/**
 * Split a markdown document into its `## ` sections.
 *
 * @param {string} markdown
 * @returns {Map<string, {title: string, start: number, end: number, lines: string[]}>}
 */
function sections(markdown) {
  const lines = markdown.split('\n');
  const found = new Map();
  let current = null;
  lines.forEach((line, index) => {
    const heading = /^## (.+)$/.exec(line);
    if (!heading) return;
    if (current) current.end = index;
    current = { title: heading[1].trim(), start: index + 1, end: lines.length, lines: [] };
    found.set(current.title, current);
  });
  for (const section of found.values()) {
    section.lines = lines.slice(section.start, section.end);
  }
  return found;
}

/**
 * Parse the `Backlog` section of TASKS.md into task entries.
 *
 * Non-task `### ` headings inside Backlog (e.g. "Terminology note") are ignored
 * — only headings of the form `### [T035] Title` are tasks.
 *
 * @param {string} markdown TASKS.md contents
 * @returns {Array<Task>}
 */
export function parseBacklog(markdown) {
  const backlog = sections(markdown).get('Backlog');
  if (!backlog) return [];
  return parseEntries(backlog.lines, backlog.start);
}

/**
 * @typedef {object} Task
 * @property {string} id
 * @property {string} title
 * @property {Record<string,string>} fields
 * @property {string} status
 * @property {string} entry Verbatim `### [ID] …` block, trailing blank lines trimmed
 * @property {number} startLine 0-based line index of the heading in the source document
 * @property {number} endLine 0-based exclusive end line
 * @property {string[]} dependsOn
 */

function parseEntries(lines, offset) {
  const tasks = [];
  let current = null;
  const close = (endIndex) => {
    if (!current) return;
    current.endLine = offset + endIndex;
    const raw = lines.slice(current.startLine - offset, endIndex);
    while (raw.length && raw[raw.length - 1].trim() === '') raw.pop();
    current.entry = raw.join('\n');
    current.status = current.fields.Status ?? '';
    const body = current.entry;
    const deps = new Set();
    for (const match of body.matchAll(DEPENDS_ON)) deps.add(match[1]);
    current.dependsOn = [...deps].filter((id) => id !== current.id);
    tasks.push(current);
    current = null;
  };

  lines.forEach((line, index) => {
    const heading = ENTRY_HEADING.exec(line);
    if (heading) {
      close(index);
      current = {
        id: heading[1],
        title: heading[2].trim(),
        fields: {},
        startLine: offset + index,
        endLine: offset + lines.length,
        entry: '',
        status: '',
        dependsOn: [],
      };
      return;
    }
    if (!current) return;
    if (/^#{1,3} /.test(line)) {
      close(index);
      return;
    }
    const field = FIELD.exec(line);
    if (field) current.fields[field[1].trim()] = field[2].trim();
  });
  close(lines.length);
  return tasks;
}

/**
 * An umbrella parent has no exit criteria of its own and at least one child.
 *
 * @param {Task} task
 * @param {Array<Task>} all
 */
export function isUmbrella(task, all) {
  return !task.fields['Exit criteria'] && childrenOf(task, all).length > 0;
}

/** Children of `T038` are `T038.1`, `T038.2`, … in backlog order. */
export function childrenOf(task, all) {
  return all.filter((candidate) => candidate.id.startsWith(`${task.id}.`));
}

/**
 * IDs present in TASKS_DONE.md with a `Done` status.
 *
 * Parsed from headings rather than a full-document scan so it stays correct as
 * the archive grows.
 *
 * @param {string} markdown TASKS_DONE.md contents
 * @returns {Set<string>}
 */
export function parseDoneIds(markdown) {
  const done = new Set();
  const lines = markdown.split('\n');
  lines.forEach((line, index) => {
    const heading = ENTRY_HEADING.exec(line);
    if (!heading) return;
    const window = lines.slice(index + 1, index + 12).join('\n');
    const status = /^- \*\*Status:\*\*\s*(.*)$/m.exec(window);
    if (status && /^done(?:\s|$)/i.test(status[1].trim())) done.add(heading[1]);
  });
  return done;
}

/**
 * Resolve the planning policy for a task.
 *
 * - `**Planning:** Implementer` — the implementer plans inline, no planner stage
 * - `**Planning:** Required`    — always run the separate planner
 * - field absent                — safe default: run the separate planner
 *
 * Complexity is never inferred from priority. The only automatic movement is
 * escalation of an `Implementer` annotation into `Required` when the entry
 * names an architecturally load-bearing area.
 *
 * @param {Task} task
 * @returns {{policy: string, source: 'field'|'default'|'escalated', reason: string}}
 */
export function resolvePlanningPolicy(task) {
  const declared = (task.fields.Planning ?? '').trim().toLowerCase();
  if (declared.startsWith('required')) {
    return { policy: PLANNING_REQUIRED, source: 'field', reason: 'task declares Planning: Required' };
  }
  if (!declared) {
    return {
      policy: PLANNING_REQUIRED,
      source: 'default',
      reason: 'task declares no Planning field; defaulting to the separate planner',
    };
  }
  if (!declared.startsWith('implementer')) {
    return {
      policy: PLANNING_REQUIRED,
      source: 'default',
      reason: `unrecognized Planning value ${JSON.stringify(task.fields.Planning)}; defaulting to the separate planner`,
    };
  }
  // Area labels are categorical, so a risk term there is authoritative. In
  // prose, persistence requires an action as well as a noun: documentation can
  // legitimately describe "persistence domains", and Notes commonly say "do
  // not add persistence". Neither means the task changes a storage boundary.
  // Notes are intentionally excluded from automatic escalation; their product
  // constraints should be reflected by an explicit `Planning: Required` when
  // they make implementation risky.
  const area = task.fields.Area ?? '';
  const summary = [task.title, task.fields.Description].filter(Boolean).join('\n');
  const signal =
    AREA_ESCALATION_SIGNALS.find(({ pattern }) => pattern.test(area)) ??
    SUMMARY_ESCALATION_SIGNALS.find(({ pattern }) => pattern.test(summary));
  if (signal) {
    return {
      policy: PLANNING_REQUIRED,
      source: 'escalated',
      reason: `task declares Planning: Implementer but touches ${signal.reason}; escalated to the separate planner`,
    };
  }
  return { policy: PLANNING_IMPLEMENTER, source: 'field', reason: 'task declares Planning: Implementer' };
}

/**
 * Branch slug from a task title: lowercase kebab, truncated on a word boundary.
 *
 * @param {string} title
 * @param {number} [maxLength]
 */
export function slugify(title, maxLength = 40) {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'task';
  const kept = [];
  let length = 0;
  for (const word of words) {
    const next = length === 0 ? word.length : length + 1 + word.length;
    if (kept.length > 0 && next > maxLength) break;
    kept.push(word);
    length = next;
  }
  return kept.join('-').slice(0, maxLength).replace(/-+$/, '');
}

/** `task/T035-add-a-global-notes-archive` */
export function branchNameFor(task) {
  return `task/${task.id}-${slugify(task.title)}`;
}

/** Task ID a `task/<ID>-<slug>` branch belongs to, or null. */
export function taskIdFromBranch(branch) {
  const match = /^(?:refs\/heads\/)?task\/(T\d+(?:\.\d+)?)-/.exec(branch);
  return match ? match[1] : null;
}

/**
 * Rewrite exactly one task's `- **Status:** …` line.
 *
 * Throws rather than silently no-op'ing if the entry or its status line is
 * missing — a claim that didn't change the status is a claim that lied.
 *
 * @param {string} markdown TASKS.md contents
 * @param {string} taskId
 * @param {string} status
 * @returns {string}
 */
export function setTaskStatus(markdown, taskId, status) {
  const lines = markdown.split('\n');
  const tasks = parseBacklog(markdown);
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`task ${taskId} not found in Backlog`);
  for (let index = task.startLine; index < task.endLine; index += 1) {
    if (/^- \*\*Status:\*\*/.test(lines[index])) {
      lines[index] = `- **Status:** ${status}`;
      return lines.join('\n');
    }
  }
  throw new Error(`task ${taskId} has no Status line`);
}

/**
 * Select the task to act on.
 *
 * @param {object} input
 * @param {Array<Task>} input.tasks Backlog entries in file order
 * @param {Set<string>} input.doneIds IDs archived in TASKS_DONE.md
 * @param {Map<string, string[]>} input.claimedBranches taskId -> remote branch names
 * @param {string|null} [input.requestedId]
 * @returns {SelectionResult}
 *
 * @typedef {object} SelectionResult
 * @property {'selected'|'blocked'|'backlog-exhausted'} status
 * @property {Task} [task]
 * @property {boolean} [resolvedFromParent]
 * @property {{reason: string, detail: string, taskId?: string}} [blocker]
 * @property {Array<{id: string, reason: string, detail: string}>} skipped
 */
export function selectTask({ tasks, doneIds, claimedBranches, requestedId = null }) {
  const skipped = [];
  const claimedFor = (id) => claimedBranches.get(id) ?? [];
  const unmetDependency = (task) => task.dependsOn.find((dependency) => !doneIds.has(dependency));

  if (requestedId) {
    let task = tasks.find((candidate) => candidate.id === requestedId);
    if (!task) {
      return {
        status: 'blocked',
        skipped,
        blocker: { reason: 'not-found', taskId: requestedId, detail: `${requestedId} is not in TASKS.md Backlog` },
      };
    }
    let resolvedFromParent = false;
    if (isUmbrella(task, tasks)) {
      const child = childrenOf(task, tasks).find(
        (candidate) => candidate.status === 'Not started' && !unmetDependency(candidate),
      );
      if (!child) {
        return {
          status: 'blocked',
          skipped,
          blocker: {
            reason: 'umbrella-no-actionable-child',
            taskId: task.id,
            detail: `${task.id} is an umbrella entry with no actionable child`,
          },
        };
      }
      resolvedFromParent = true;
      task = child;
    }
    if (!['Not started', 'In progress'].includes(task.status)) {
      return {
        status: 'blocked',
        skipped,
        blocker: { reason: 'status', taskId: task.id, detail: `${task.id} has status ${task.status || '(none)'}` },
      };
    }
    const dependency = unmetDependency(task);
    if (dependency) {
      return {
        status: 'blocked',
        skipped,
        blocker: {
          reason: 'dependency',
          taskId: task.id,
          detail: `${task.id} depends on ${dependency}, which is not in TASKS_DONE.md`,
        },
      };
    }
    const claimed = claimedFor(task.id);
    if (claimed.length > 0) {
      return {
        status: 'blocked',
        skipped,
        blocker: {
          reason: 'claimed',
          taskId: task.id,
          detail: `${task.id} is already claimed by ${claimed.join(', ')}`,
        },
      };
    }
    return { status: 'selected', task, resolvedFromParent, skipped };
  }

  for (const candidate of tasks) {
    if (isUmbrella(candidate, tasks)) {
      // Children are separate backlog entries that follow the parent in file
      // order, so they get visited on their own — no special-casing needed.
      skipped.push({ id: candidate.id, reason: 'umbrella', detail: 'umbrella entry has no exit criteria of its own' });
      continue;
    }
    if (candidate.status !== 'Not started') {
      skipped.push({ id: candidate.id, reason: 'status', detail: `status is ${candidate.status || '(none)'}` });
      continue;
    }
    const dependency = unmetDependency(candidate);
    if (dependency) {
      skipped.push({
        id: candidate.id,
        reason: 'dependency',
        detail: `depends on ${dependency}, which is not in TASKS_DONE.md`,
      });
      continue;
    }
    const claimed = claimedFor(candidate.id);
    if (claimed.length > 0) {
      // A claimed task is never silently dropped — it's still visible in
      // `skipped` — but it no longer stops the scan. An independent task later
      // in the backlog should still be picked up in the same continuous run.
      // Anything that actually depends on this one stays correctly blocked by
      // the dependency check above, since a claimed-but-unmerged task is never
      // in doneIds, so a chained task is never attempted early.
      skipped.push({
        id: candidate.id,
        reason: 'claimed',
        detail: `already claimed by ${claimed.join(', ')}`,
      });
      continue;
    }
    return { status: 'selected', task: candidate, resolvedFromParent: false, skipped };
  }
  return { status: 'backlog-exhausted', skipped };
}
