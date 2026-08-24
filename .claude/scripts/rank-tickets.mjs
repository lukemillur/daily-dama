#!/usr/bin/env node
// Deterministic value-ranking for actionable TASKS.md backlog tickets.
//
// Companion to ticket-claim.mjs: reuses exactly the same parsing and the
// exact same actionable definition (not-started, non-umbrella, every
// dependency — including multi-id and ranged "Depends on" clauses — already
// in TASKS_DONE.md, no existing task/<ID>-* branch on origin) via
// lib/tasks.mjs, so the two never disagree about what's pickable. It only
// adds an order: unblock fan-out, then Priority, then file order, instead of
// ticket-claim.mjs's plain file-order scan.
//
// This exists so a caller who wants "the highest-value next ticket" doesn't
// have to read all of TASKS.md/TASKS_DONE.md into a model context every
// cycle just to re-derive it — this script does that parsing in plain node
// and prints only the compact ranked result.
//
// Usage:
//   node .claude/scripts/rank-tickets.mjs             # full ranked list, best first
//   node .claude/scripts/rank-tickets.mjs --top 1     # just the top pick

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRunner } from './lib/exec.mjs';
import { parseBacklog, parseDoneIds, isUmbrella, resolveDependsOn } from './lib/tasks.mjs';
import { remoteClaims } from './ticket-claim.mjs';

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function parseArgs(argv) {
  const options = { top: null, repoRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--top') options.top = Number(argv[++index]);
    else if (arg === '--repo') options.repoRoot = argv[++index];
    else throw new Error(`unrecognized argument: ${arg}`);
  }
  return options;
}

export function rankTickets({ tasksMd, doneMd, claimedBranches }) {
  const tasks = parseBacklog(tasksMd);
  const doneIds = parseDoneIds(doneMd);
  const knownIds = new Set([...tasks.map((task) => task.id), ...doneIds]);
  const dependsOn = new Map(tasks.map((task) => [task.id, resolveDependsOn(task, knownIds)]));
  const unmetDependency = (task) => [...dependsOn.get(task.id)].find((dependency) => !doneIds.has(dependency));
  const fileIndex = new Map(tasks.map((task, index) => [task.id, index]));

  const actionable = tasks.filter(
    (task) =>
      !isUmbrella(task, tasks) &&
      task.status === 'Not started' &&
      !unmetDependency(task) &&
      (claimedBranches.get(task.id) ?? []).length === 0,
  );

  // How many other not-yet-done tickets name this one in their own "Depends on".
  const fanOut = (id) => tasks.filter((task) => !doneIds.has(task.id) && dependsOn.get(task.id).has(id)).length;

  return actionable
    .map((task) => ({
      id: task.id,
      title: task.title,
      priority: (task.fields.Priority ?? '').trim(),
      fanOut: fanOut(task.id),
    }))
    .sort(
      (a, b) =>
        b.fanOut - a.fanOut ||
        (PRIORITY_RANK[a.priority.toLowerCase()] ?? 3) - (PRIORITY_RANK[b.priority.toLowerCase()] ?? 3) ||
        fileIndex.get(a.id) - fileIndex.get(b.id),
    );
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
  const tasksMd = fs.readFileSync(path.join(repoRoot, 'TASKS.md'), 'utf8');
  const doneMd = fs.readFileSync(path.join(repoRoot, 'TASKS_DONE.md'), 'utf8');
  const claimedBranches = remoteClaims(run, repoRoot);

  const ranked = rankTickets({ tasksMd, doneMd, claimedBranches });
  const output = options.top ? ranked.slice(0, options.top) : ranked;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
