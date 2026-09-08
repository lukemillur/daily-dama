#!/usr/bin/env node
// Dependency vulnerability gate. `yarn audit --level <severity>` does NOT gate Yarn
// Classic's exit code -- the flag only filters the printed report, while the exit code
// is a presence bitmask over severity counts computed *before* the `--level` filter is
// applied (info=1, low=2, moderate=4, high=8, critical=16; verified against Yarn
// Classic 1.22.22's own `cli.js`). That mask collides with yarn's generic failure exit
// of 1 (bit-identical to the `info` bit), so exit status alone can never distinguish a
// legitimate advisory report from a process/network failure. The only reliable
// completion signal is exactly one well-formed `auditSummary` NDJSON line -- yarn's
// `Audit.report()` always emits one when the audit request completes, and omits it
// otherwise. This script therefore trusts `auditSummary` presence + the mask invariant
// (status === maskOf(summary)) over the raw exit code, and fails closed (exit 2,
// prefixed `BLOCKED:`) whenever the run cannot be proven complete, rather than
// reporting success from empty or malformed output.
//
// Exit codes:
//   0 - audit provably completed and every gated (high/critical) advisory is accepted.
//   1 - audit completed; at least one un-accepted high/critical advisory. Policy failure.
//   2 - the audit could not be trusted to have completed. Operational/blocked failure.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const ACCEPTED_ADVISORIES_PATH = resolve(REPO_ROOT, "security/accepted-dependency-advisories.json");

export const GATED_SEVERITIES = new Set(["high", "critical"]);
export const KNOWN_SEVERITIES = new Set(["info", "low", "moderate", "high", "critical"]);
export const SEVERITY_EXIT_BITS = Object.freeze({
  info: 1,
  low: 2,
  moderate: 4,
  high: 8,
  critical: 16,
});

const LOG_PREFIX = "[check-dependency-audit]";
const BLOCKED_PREFIX = `${LOG_PREFIX} BLOCKED:`;

export function summaryExitMask(vulnerabilities) {
  let mask = 0;
  for (const [severity, bit] of Object.entries(SEVERITY_EXIT_BITS)) {
    if (vulnerabilities[severity]) mask += bit;
  }
  return mask;
}

function isFiniteNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function parseJsonLine(line) {
  try {
    return { ok: true, value: JSON.parse(line) };
  } catch {
    return { ok: false };
  }
}

export function parseAuditStreams(stdout, stderr) {
  const advisoriesById = new Map();
  const summaries = [];
  const yarnErrors = [];
  const malformedAdvisories = [];
  let unparsedStdoutLines = 0;

  for (const rawLine of (stdout ?? "").split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const parsed = parseJsonLine(line);
    if (!parsed.ok) {
      unparsedStdoutLines += 1;
      continue;
    }
    const entry = parsed.value;
    if (entry && entry.type === "error") {
      yarnErrors.push(String(entry.data ?? "").slice(0, 500));
      continue;
    }
    if (entry && entry.type === "auditSummary") {
      summaries.push(entry);
      continue;
    }
    if (entry && entry.type === "auditAdvisory") {
      const advisory = entry.data && entry.data.advisory;
      if (
        !advisory ||
        advisory.id === undefined ||
        advisory.id === null ||
        !KNOWN_SEVERITIES.has(advisory.severity)
      ) {
        malformedAdvisories.push(line.slice(0, 500));
        continue;
      }
      // yarn reports one auditAdvisory entry per dependency path -- dedupe by id.
      advisoriesById.set(String(advisory.id), advisory);
    }
  }

  for (const rawLine of (stderr ?? "").split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const parsed = parseJsonLine(line);
    // Unparseable stderr lines are normal (yarn license warnings, Node deprecation
    // notices) -- never fail on them. Only structured `type: "error"` JSON lines count.
    if (!parsed.ok) continue;
    const entry = parsed.value;
    if (entry && entry.type === "error") {
      yarnErrors.push(String(entry.data ?? "").slice(0, 500));
    }
  }

  return {
    advisories: [...advisoriesById.values()],
    summaries,
    yarnErrors,
    malformedAdvisories,
    unparsedStdoutLines,
  };
}

export function classifyAuditRun(result) {
  const reasons = [];

  if (result.error) {
    reasons.push(`spawn failure: ${result.error.code ?? "unknown code"} -- ${result.error.message}`);
    return { ok: false, reasons };
  }
  if (result.signal) {
    reasons.push(`process terminated by signal ${result.signal}`);
    return { ok: false, reasons };
  }
  if (result.status === null || !Number.isInteger(result.status)) {
    reasons.push(`process did not exit normally (status: ${JSON.stringify(result.status)})`);
    return { ok: false, reasons };
  }

  const { advisories, summaries, yarnErrors, malformedAdvisories, unparsedStdoutLines } = parseAuditStreams(
    result.stdout,
    result.stderr,
  );

  if (yarnErrors.length > 0) {
    for (const message of yarnErrors) {
      reasons.push(`yarn reported an error: ${message}`);
    }
  }

  if (summaries.length === 0) {
    reasons.push("no auditSummary line found -- the audit did not provably complete");
  } else if (summaries.length > 1) {
    reasons.push(`expected exactly one auditSummary line, found ${summaries.length}`);
  }

  if (malformedAdvisories.length > 0) {
    for (const raw of malformedAdvisories) {
      reasons.push(`malformed auditAdvisory line: ${raw}`);
    }
  }

  let summary;
  if (summaries.length === 1) {
    const vulnerabilities = summaries[0].data && summaries[0].data.vulnerabilities;
    if (!vulnerabilities || typeof vulnerabilities !== "object") {
      reasons.push("auditSummary.data.vulnerabilities is missing or not an object");
    } else {
      const missingOrInvalid = [...KNOWN_SEVERITIES].filter(
        (severity) => !isFiniteNonNegativeInteger(vulnerabilities[severity]),
      );
      if (missingOrInvalid.length > 0) {
        reasons.push(
          `auditSummary.data.vulnerabilities has missing/invalid counts for: ${missingOrInvalid.join(", ")}`,
        );
      } else {
        summary = summaries[0];
        const expectedMask = summaryExitMask(vulnerabilities);
        if (result.status !== expectedMask) {
          reasons.push(
            `yarn exit status ${result.status} does not match the severity mask ${expectedMask} computed from ` +
              `auditSummary (info=${vulnerabilities.info} low=${vulnerabilities.low} moderate=${vulnerabilities.moderate} ` +
              `high=${vulnerabilities.high} critical=${vulnerabilities.critical})`,
          );
        }

        for (const severity of ["high", "critical"]) {
          if (vulnerabilities[severity] > 0 && !advisories.some((advisory) => advisory.severity === severity)) {
            reasons.push(
              `auditSummary reports ${severity}=${vulnerabilities[severity]} but no parsed auditAdvisory line ` +
                `carries that severity -- refusing to report success without visibility into the finding`,
            );
          }
        }
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  return { ok: true, advisories, summary, unparsedStdoutLines };
}

export function loadAcceptedAdvisories(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`could not read accepted-advisories file at ${path}: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`accepted-advisories file at ${path} is not valid JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`accepted-advisories file at ${path} must be a JSON array`);
  }

  const seenIds = new Set();
  parsed.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`accepted-advisories[${index}] must be an object`);
    }
    const idOk =
      (typeof entry.id === "number" && Number.isFinite(entry.id)) ||
      (typeof entry.id === "string" && entry.id.length > 0);
    if (!idOk) {
      throw new Error(`accepted-advisories[${index}].id must be a non-empty string or number`);
    }
    if (typeof entry.package !== "string" || entry.package.length === 0) {
      throw new Error(`accepted-advisories[${index}].package must be a non-empty string`);
    }
    if (!KNOWN_SEVERITIES.has(entry.severity)) {
      throw new Error(`accepted-advisories[${index}].severity must be one of ${[...KNOWN_SEVERITIES].join(", ")}`);
    }
    if (typeof entry.reason !== "string" || entry.reason.length === 0) {
      throw new Error(`accepted-advisories[${index}].reason must be a non-empty string`);
    }
    if (typeof entry.reviewedAsOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAsOf)) {
      throw new Error(`accepted-advisories[${index}].reviewedAsOf must be a YYYY-MM-DD date string`);
    }
    const idKey = String(entry.id);
    if (seenIds.has(idKey)) {
      throw new Error(`accepted-advisories[${index}].id ${idKey} is a duplicate`);
    }
    seenIds.add(idKey);
  });

  return parsed;
}

export function evaluatePolicy({ advisories, acceptedAdvisories }) {
  const acceptedIds = new Set(acceptedAdvisories.map((entry) => String(entry.id)));
  const gated = advisories.filter((advisory) => GATED_SEVERITIES.has(advisory.severity));
  const unaccepted = gated.filter((advisory) => !acceptedIds.has(String(advisory.id)));

  const advisoryIds = new Set(advisories.map((advisory) => String(advisory.id)));
  const notices = acceptedAdvisories
    .filter((entry) => !advisoryIds.has(String(entry.id)))
    .map(
      (entry) =>
        `accepted advisory ${entry.id} (${entry.package}) did not appear in this audit run -- it may be ` +
        "removable from security/accepted-dependency-advisories.json.",
    );

  return { gated, unaccepted, notices };
}

export function runDependencyAuditGate({ runAudit, acceptedAdvisories, log = console.log, logError = console.error }) {
  const result = runAudit();
  const classification = classifyAuditRun(result);

  if (!classification.ok) {
    logError(`${BLOCKED_PREFIX} the dependency audit did not provably complete:`);
    for (const reason of classification.reasons) {
      logError(`${BLOCKED_PREFIX} - ${reason}`);
    }
    return 2;
  }

  const { advisories, summary, unparsedStdoutLines } = classification;
  const vulnerabilities = summary.data.vulnerabilities;
  log(
    `${LOG_PREFIX} audit completed: ${summary.data.totalDependencies ?? "unknown"} total dependencies; ` +
      `vulnerabilities info=${vulnerabilities.info} low=${vulnerabilities.low} moderate=${vulnerabilities.moderate} ` +
      `high=${vulnerabilities.high} critical=${vulnerabilities.critical} (yarn exit ${result.status}, matches severity mask).`,
  );
  if (unparsedStdoutLines > 0) {
    log(`${LOG_PREFIX} notice: ${unparsedStdoutLines} unparseable stdout line(s) ignored.`);
  }

  const { gated, unaccepted, notices } = evaluatePolicy({ advisories, acceptedAdvisories });

  for (const notice of notices) {
    log(`${LOG_PREFIX} notice: ${notice}`);
  }

  if (gated.length === 0) {
    log(`${LOG_PREFIX} no high/critical advisories found.`);
    return 0;
  }

  const acceptedIds = new Set(acceptedAdvisories.map((entry) => String(entry.id)));
  log(`${LOG_PREFIX} high/critical advisories found (accepted entries are marked):`);
  log(["id", "package", "severity", "accepted", "title", "url"].join(" | "));
  for (const advisory of gated) {
    const accepted = acceptedIds.has(String(advisory.id));
    log(
      [advisory.id, advisory.module_name, advisory.severity, accepted ? "yes" : "NO", advisory.title, advisory.url].join(
        " | ",
      ),
    );
  }

  if (unaccepted.length > 0) {
    logError(
      `${LOG_PREFIX} one or more high/critical advisories are not in ` +
        "security/accepted-dependency-advisories.json. Fix the dependency, or add a " +
        "dated, reasoned entry to that file if there is genuinely no upstream patch.",
    );
    return 1;
  }

  log(
    `${LOG_PREFIX} all high/critical advisories are accepted per security/accepted-dependency-advisories.json.`,
  );
  return 0;
}

function realRunAudit() {
  return spawnSync("yarn", ["audit", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
}

function main() {
  let acceptedAdvisories;
  try {
    acceptedAdvisories = loadAcceptedAdvisories(ACCEPTED_ADVISORIES_PATH);
  } catch (error) {
    console.error(`${BLOCKED_PREFIX} ${error.message}`);
    process.exitCode = 2;
    return;
  }

  process.exitCode = runDependencyAuditGate({ runAudit: realRunAudit, acceptedAdvisories });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
