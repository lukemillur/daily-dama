#!/usr/bin/env node
// T162.3: dependency vulnerability gate. `yarn audit --level <severity>` does NOT gate
// Yarn Classic's exit code -- the flag only filters the printed report, while the exit
// code is a bitmask of every severity present regardless of --level (verified locally,
// see .claude/plans/T162.3.md). This script parses `yarn audit --json`'s NDJSON output
// directly and applies its own severity threshold + allowlist instead.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const ACCEPTED_ADVISORIES_PATH = resolve(REPO_ROOT, "security/accepted-dependency-advisories.json");
const GATED_SEVERITIES = new Set(["high", "critical"]);

function loadAcceptedAdvisoryIds() {
  const entries = JSON.parse(readFileSync(ACCEPTED_ADVISORIES_PATH, "utf8"));
  return new Set(entries.map((entry) => entry.id));
}

function runYarnAudit() {
  const result = spawnSync("yarn", ["audit", "--json"], { cwd: REPO_ROOT, encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  return result.stdout ?? "";
}

function parseAdvisories(ndjson) {
  const advisoriesById = new Map();
  for (const line of ndjson.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (entry.type !== "auditAdvisory") continue;
    const advisory = entry.data.advisory;
    // yarn reports one auditAdvisory entry per dependency path -- dedupe by advisory id.
    advisoriesById.set(advisory.id, advisory);
  }
  return [...advisoriesById.values()];
}

function main() {
  const acceptedIds = loadAcceptedAdvisoryIds();
  const ndjson = runYarnAudit();
  const advisories = parseAdvisories(ndjson);
  const gated = advisories.filter((advisory) => GATED_SEVERITIES.has(advisory.severity));

  if (gated.length === 0) {
    console.log("[check-dependency-audit] no high/critical advisories found.");
    return;
  }

  console.log("[check-dependency-audit] high/critical advisories found (accepted entries are marked):");
  console.log(
    ["id", "package", "severity", "accepted", "title", "url"].join(" | "),
  );
  let hasUnaccepted = false;
  for (const advisory of gated) {
    const accepted = acceptedIds.has(advisory.id);
    if (!accepted) hasUnaccepted = true;
    console.log(
      [
        advisory.id,
        advisory.module_name,
        advisory.severity,
        accepted ? "yes" : "NO",
        advisory.title,
        advisory.url,
      ].join(" | "),
    );
  }

  if (hasUnaccepted) {
    console.error(
      "[check-dependency-audit] one or more high/critical advisories are not in " +
        "security/accepted-dependency-advisories.json. Fix the dependency, or add a " +
        "dated, reasoned entry to that file if there is genuinely no upstream patch.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    "[check-dependency-audit] all high/critical advisories are accepted per security/accepted-dependency-advisories.json.",
  );
}

main();
