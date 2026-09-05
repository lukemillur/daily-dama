#!/usr/bin/env node
// T228: permanent regression guard proving the dependency-audit gate fails closed.
// Before this ticket, `check-dependency-audit.mjs` read only stdout, ignored
// `result.status`, ignored stderr, and reported "no high/critical advisories found"
// with exit 0 whenever the audit never actually ran (e.g. a network failure). Every
// case below is dependency-free and network-free: audit output is injected through the
// `runAudit` seam, never spawned for real, except the process-level cases at the end
// which spawn the real script against a fake `yarn` shim to prove `process.exitCode`
// itself propagates correctly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluatePolicy,
  loadAcceptedAdvisories,
  parseAuditStreams,
  runDependencyAuditGate,
  summaryExitMask,
} from "./check-dependency-audit.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const CHECK_SCRIPT = resolve(REPO_ROOT, "security/scripts/check-dependency-audit.mjs");

function ndjson(...entries) {
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
}

function summaryLine(counts) {
  const vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...counts };
  return {
    type: "auditSummary",
    data: {
      vulnerabilities,
      dependencies: 1158,
      devDependencies: 0,
      optionalDependencies: 0,
      totalDependencies: 1158,
    },
  };
}

function fakeAdvisory({ id, severity, module_name = "some-package" }) {
  return {
    type: "auditAdvisory",
    data: {
      resolution: { id, path: `root>${module_name}` },
      advisory: {
        id,
        module_name,
        severity,
        title: `Fake advisory ${id}`,
        url: `https://example.com/advisories/${id}`,
        patched_versions: "<0.0.0",
      },
    },
  };
}

function makeLoggers() {
  const logs = [];
  const errors = [];
  return {
    log: (...args) => logs.push(args.join(" ")),
    logError: (...args) => errors.push(args.join(" ")),
    logs,
    errors,
    all: () => [...logs, ...errors].join("\n"),
  };
}

function runGate({ result, acceptedAdvisories = [] }) {
  const loggers = makeLoggers();
  const exitCode = runDependencyAuditGate({
    runAudit: () => result,
    acceptedAdvisories,
    log: loggers.log,
    logError: loggers.logError,
  });
  return { exitCode, ...loggers };
}

test("dependency-audit gate: operational failures fail closed with exit 2 and BLOCKED", async (t) => {
  await t.test("spawn failure (ENOENT)", () => {
    const result = {
      error: Object.assign(new Error("spawn yarn ENOENT"), { code: "ENOENT" }),
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
    };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /BLOCKED/);
    assert.match(all(), /ENOENT/);
  });

  await t.test("process killed by signal", () => {
    const result = { status: null, signal: "SIGKILL", stdout: "", stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /BLOCKED/);
    assert.match(all(), /SIGKILL/);
  });

  await t.test("regression: real network-failure fixture (proxy-blocked audit) reported as blocked, not clean", () => {
    // This is the exact reproduction from planning: a proxy-blocked `yarn audit --json`
    // exits 1 (indistinguishable from the info-severity bit), stdout has only the
    // boilerplate info line (no auditSummary), and stderr carries yarn's structured
    // `type: "error"` line describing the network failure. The old script reported
    // "no high/critical advisories found" with exit 0 for exactly this input.
    const stdout = ndjson({
      type: "info",
      data: "Visit https://yarnpkg.com/en/docs/cli/audit for documentation about this command.",
    });
    const stderr = [
      JSON.stringify({ type: "warning", data: "../../../../package.json: No license field" }),
      "(node:12345) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized",
      JSON.stringify({
        type: "error",
        data:
          "Error: https://registry.yarnpkg.com/-/npm/v1/security/audits: tunneling socket could not be " +
          "established, cause=connect ECONNREFUSED 127.0.0.1:9\n    at ClientRequest.onError",
      }),
    ].join("\n");
    const result = { status: 1, signal: null, stdout, stderr };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /BLOCKED/);
    assert.match(all(), /ECONNREFUSED/);
  });

  await t.test("type:error line on stdout instead of stderr", () => {
    const stdout = ndjson({ type: "error", data: "registry unreachable" });
    const result = { status: 1, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /registry unreachable/);
  });

  await t.test("well-formed advisories but no auditSummary never counts as completion", () => {
    const stdout = ndjson(fakeAdvisory({ id: 1, severity: "high" }));
    const result = { status: 12, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /BLOCKED/);
    assert.match(all(), /no auditSummary/);
  });

  await t.test("two auditSummary lines", () => {
    const stdout = ndjson(summaryLine({}), summaryLine({}));
    const result = { status: 0, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /exactly one auditSummary/);
  });

  await t.test("auditSummary with empty data object", () => {
    const stdout = ndjson({ type: "auditSummary", data: {} });
    const result = { status: 0, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /vulnerabilities is missing/);
  });

  await t.test("auditSummary with a non-integer count", () => {
    const stdout = ndjson({
      type: "auditSummary",
      data: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: "3", critical: 0 } },
    });
    const result = { status: 0, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /invalid counts/);
  });

  await t.test("malformed auditAdvisory (missing advisory data)", () => {
    const stdout = ndjson({ type: "auditAdvisory", data: {} }, summaryLine({ high: 1 }));
    const result = { status: 8, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /malformed auditAdvisory/);
  });

  await t.test("advisory with unknown severity", () => {
    const stdout = ndjson(fakeAdvisory({ id: 1, severity: "sev-high" }), summaryLine({ high: 1 }));
    const result = { status: 8, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /malformed auditAdvisory/);
  });

  await t.test("mask mismatch: summary says high=3 but status is 0", () => {
    const stdout = ndjson(fakeAdvisory({ id: 1, severity: "high" }), summaryLine({ high: 3 }));
    const result = { status: 0, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /does not match the severity mask/);
  });

  await t.test("report inconsistency: summary counts high advisories but none were parsed", () => {
    const stdout = ndjson(summaryLine({ high: 3 }));
    const result = { status: 8, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /no parsed auditAdvisory line/);
  });

  await t.test("garbage-only stdout", () => {
    const result = { status: 127, signal: null, stdout: "yarn: command failed\n", stderr: "" };
    const { exitCode, all } = runGate({ result });
    assert.equal(exitCode, 2);
    assert.match(all(), /no auditSummary/);
  });

  await t.test("loadAcceptedAdvisories rejects malformed allowlist shapes", () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "dep-audit-allowlist-"));
    t.after(() => rmSync(scratchDir, { recursive: true, force: true }));

    const notArrayPath = join(scratchDir, "not-array.json");
    writeFileSync(notArrayPath, "{}");
    assert.throws(() => loadAcceptedAdvisories(notArrayPath), /must be a JSON array/);

    const missingFieldsPath = join(scratchDir, "missing-fields.json");
    writeFileSync(missingFieldsPath, JSON.stringify([{ id: 1 }]));
    assert.throws(() => loadAcceptedAdvisories(missingFieldsPath), /package/);

    const duplicateIdPath = join(scratchDir, "duplicate-id.json");
    writeFileSync(
      duplicateIdPath,
      JSON.stringify([
        { id: 1, package: "a", severity: "high", reason: "r", reviewedAsOf: "2026-01-01" },
        { id: 1, package: "b", severity: "high", reason: "r", reviewedAsOf: "2026-01-01" },
      ]),
    );
    assert.throws(() => loadAcceptedAdvisories(duplicateIdPath), /duplicate/);
  });
});

test("dependency-audit gate: policy outcomes on complete audit output", async (t) => {
  const accepted = [
    { id: 1, package: "pkg-a", severity: "high", reason: "no patch", reviewedAsOf: "2026-09-04" },
    { id: 2, package: "pkg-b", severity: "high", reason: "no patch", reviewedAsOf: "2026-09-04" },
    { id: 3, package: "pkg-c", severity: "critical", reason: "no patch", reviewedAsOf: "2026-09-04" },
  ];

  await t.test("complete output, all high/critical advisories accepted, plus unrelated moderates -> 0", () => {
    const stdout = ndjson(
      fakeAdvisory({ id: 1, severity: "high" }),
      fakeAdvisory({ id: 2, severity: "high" }),
      fakeAdvisory({ id: 3, severity: "critical" }),
      fakeAdvisory({ id: 4, severity: "moderate" }),
      summaryLine({ moderate: 1, high: 2, critical: 1 }),
    );
    const result = { status: summaryExitMask({ info: 0, low: 0, moderate: 1, high: 2, critical: 1 }), signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result, acceptedAdvisories: accepted });
    assert.equal(exitCode, 0);
    assert.match(all(), /audit completed/);
    assert.match(all(), /accepted/);
  });

  await t.test("one high advisory absent from accepted list -> 1, names the advisory and the allowlist file", () => {
    const stdout = ndjson(
      fakeAdvisory({ id: 999, severity: "high", module_name: "unaccepted-pkg" }),
      summaryLine({ high: 1 }),
    );
    const result = { status: 8, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result, acceptedAdvisories: accepted });
    assert.equal(exitCode, 1);
    assert.match(all(), /999/);
    assert.match(all(), /accepted-dependency-advisories\.json/);
  });

  await t.test("unaccepted critical advisory -> 1", () => {
    const stdout = ndjson(
      fakeAdvisory({ id: 998, severity: "critical", module_name: "unaccepted-critical" }),
      summaryLine({ critical: 1 }),
    );
    const result = { status: 16, signal: null, stdout, stderr: "" };
    const { exitCode } = runGate({ result, acceptedAdvisories: accepted });
    assert.equal(exitCode, 1);
  });

  await t.test("clean audit, all zero, no advisories -> 0", () => {
    const stdout = ndjson(summaryLine({}));
    const result = { status: 0, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result, acceptedAdvisories: [] });
    assert.equal(exitCode, 0);
    assert.match(all(), /no high\/critical advisories found/);
  });

  await t.test("nonzero status is not itself a failure: moderate-only advisories pass", () => {
    const stdoutModerate = ndjson(fakeAdvisory({ id: 5, severity: "moderate" }), summaryLine({ moderate: 1 }));
    const moderateResult = { status: 4, signal: null, stdout: stdoutModerate, stderr: "" };
    const moderate = runGate({ result: moderateResult, acceptedAdvisories: [] });
    assert.equal(moderate.exitCode, 0);

    const stdoutLowModerate = ndjson(
      fakeAdvisory({ id: 6, severity: "low" }),
      fakeAdvisory({ id: 7, severity: "moderate" }),
      summaryLine({ low: 1, moderate: 1 }),
    );
    const lowModerateResult = { status: 6, signal: null, stdout: stdoutLowModerate, stderr: "" };
    const lowModerate = runGate({ result: lowModerateResult, acceptedAdvisories: [] });
    assert.equal(lowModerate.exitCode, 0);
  });

  await t.test("an accepted id that never appears in the audit still passes, with a stale-entry notice", () => {
    const stdout = ndjson(summaryLine({}));
    const result = { status: 0, signal: null, stdout, stderr: "" };
    const { exitCode, all } = runGate({ result, acceptedAdvisories: accepted });
    assert.equal(exitCode, 0);
    assert.match(all(), /did not appear in this audit run/);
  });
});

test("dependency-audit gate: process-level exit code propagation against a fake yarn shim", async (t) => {
  function makeShim(script) {
    const shimDir = mkdtempSync(join(tmpdir(), "dep-audit-gate-shim-"));
    const shimPath = join(shimDir, "yarn");
    writeFileSync(shimPath, `#!/bin/sh\n${script}\n`);
    chmodSync(shimPath, 0o755);
    return shimDir;
  }

  function runScriptWithShim(shimDir) {
    return spawnSync(process.execPath, [CHECK_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}` },
      encoding: "utf8",
    });
  }

  await t.test("all-zero clean audit via shim exits 0", () => {
    const summary = summaryLine({});
    const shimDir = makeShim(
      `cat <<'EOF'\n${JSON.stringify(summary)}\nEOF\nexit 0`,
    );
    t.after(() => rmSync(shimDir, { recursive: true, force: true }));

    const { status } = runScriptWithShim(shimDir);
    assert.equal(status, 0);
  });

  await t.test("fatal yarn failure via shim exits 2 with BLOCKED on stderr", () => {
    const shimDir = makeShim(`echo 'yarn: fatal error' 1>&2\nexit 127`);
    t.after(() => rmSync(shimDir, { recursive: true, force: true }));

    const { status, stderr } = runScriptWithShim(shimDir);
    assert.equal(status, 2);
    assert.match(stderr, /BLOCKED/);
  });
});

test("parseAuditStreams and evaluatePolicy helpers", () => {
  const stdout = ndjson(fakeAdvisory({ id: 1, severity: "high" }), fakeAdvisory({ id: 1, severity: "high" }));
  const { advisories, unparsedStdoutLines } = parseAuditStreams(stdout, "");
  assert.equal(advisories.length, 1, "duplicate advisory ids should dedupe");
  assert.equal(unparsedStdoutLines, 0);

  const { gated, unaccepted } = evaluatePolicy({
    advisories: [
      { id: 1, severity: "high" },
      { id: 2, severity: "moderate" },
    ],
    acceptedAdvisories: [{ id: 1 }],
  });
  assert.equal(gated.length, 1);
  assert.equal(unaccepted.length, 0);
});
