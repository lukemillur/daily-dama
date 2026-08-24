#!/usr/bin/env node
// Human-facing preview of the full unblock-value order behind
// `ticket-claim.mjs ranked`. That command drives selection directly and only
// reports the one task it picked; this script prints the whole ranked list —
// including tasks currently below the top pick — for a human deciding
// whether to just run `/newTicket ranked` or aim at a specific id instead.
//
// Reuses lib/tasks.mjs's parsing and ordering (parseBacklog/parseDoneIds/
// isUmbrella/resolveDependsOn/orderByUnblockValue/computeUnblockFanOut) so
// this list and `ticket-claim.mjs ranked`'s pick can never disagree.
//
// Usage:
//   node .claude/scripts/rank-tickets.mjs             # full ranked list, best first
//   node .claude/scripts/rank-tickets.mjs --top 1     # just the top pick

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRunner } from './lib/exec.mjs';
import {
  computeUnblockFanOut,
  isUmbrella,
  orderByUnblockValue,
  parseBacklog,
  parseDoneIds,
  resolveDependsOn,
} from './lib/tasks.mjs';
import { remoteClaims } from './ticket-claim.mjs';

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
  const unmetDependency = (task) => [...resolveDependsOn(task, knownIds)].find((dependency) => !doneIds.has(dependency));
  const fanOut = computeUnblockFanOut(tasks, doneIds);

  const actionable = new Set(
    tasks
      .filter(
        (task) =>
          !isUmbrella(task, tasks) &&
          task.status === 'Not started' &&
          !unmetDependency(task) &&
          (claimedBranches.get(task.id) ?? []).length === 0,
      )
      .map((task) => task.id),
  );

  return orderByUnblockValue(tasks, doneIds)
    .filter((task) => actionable.has(task.id))
    .map((task) => ({
      id: task.id,
      title: task.title,
      priority: (task.fields.Priority ?? '').trim(),
      fanOut: fanOut.get(task.id),
    }));
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
