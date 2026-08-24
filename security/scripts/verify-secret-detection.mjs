#!/usr/bin/env node
// T162.3: permanent regression guard proving the gitleaks wiring itself actually
// detects a representative secret, in both scanning modes used elsewhere in this repo
// (git-history scanning, mirroring gitleaks-action in CI; and plain-directory scanning
// of a built export, mirroring check-bundle-secrets.mjs). No real or committed fixture
// secret exists anywhere in this repo's permanent history or working tree -- every
// fixture used here is built into a throwaway scratch directory at test run time and
// discarded afterward. Same style as security/scripts/check-csp-headers.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExport } from "./build-and-serve.mjs";
import { runGitleaks } from "./gitleaks-cli.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
// Scratch dirs live under the repo root (gitignored, see .gitignore), not
// os.tmpdir()/os.homedir()'s system temp location: Docker Desktop's default macOS file
// sharing only covers paths under the user's home/project directories, not /tmp or
// /var/folders, so mounting a system-tmpdir path into the gitleaks container silently
// scans 0 bytes instead of erroring. This matters for local `docker run`-based
// verification; a native Linux CI runner would not have hit this, but using a
// repo-local scratch dir works in both environments.
const SCRATCH_ROOT = join(REPO_ROOT, ".security-scratch");
mkdirSync(SCRATCH_ROOT, { recursive: true });

// A clearly synthetic, Supabase-service-role-*shaped* fake JWT (three base64url
// segments, a "role":"service_role" payload) -- not a real key, never issued by any
// real Supabase project. Representative of the "service-role keys and Auth sessions"
// shape called out in the task description.
//
// Deliberately split across three constants and joined at runtime, instead of one
// contiguous literal: the assembled string is what a scratch-repo/scratch-bundle
// fixture needs to trip gitleaks' default 'jwt' rule for this self-test to mean
// anything, but this source file itself is committed to this repo's real, permanent
// history -- if the full JWT-shaped string appeared here as one literal, the
// `secret-scan` CI job would (correctly) flag this very file on every run, and the
// only fix would be adding it to .gitleaks.toml's allowlist, which would then also
// suppress it inside the scratch repos below and silently break this self-test.
const FAKE_SECRET_HEADER = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
const FAKE_SECRET_PAYLOAD = "eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyJ9";
const FAKE_SECRET_SIGNATURE = "fakeSignatureNotARealSecretXyz123456789";
const FAKE_SECRET = [FAKE_SECRET_HEADER, FAKE_SECRET_PAYLOAD, FAKE_SECRET_SIGNATURE].join(".");

function runGitCommand(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

function makeScratchDir(prefix) {
  return mkdtempSync(join(SCRATCH_ROOT, prefix));
}

test("secret detection self-test (T162.3)", async (t) => {
  await t.test("history-style detection: catches a fake secret committed to a scratch repo", () => {
    const scratchDir = makeScratchDir("gitleaks-history-");
    t.after(() => rmSync(scratchDir, { recursive: true, force: true }));

    runGitCommand(["init", "-q"], scratchDir);
    runGitCommand(["config", "user.email", "ci@example.com"], scratchDir);
    runGitCommand(["config", "user.name", "CI"], scratchDir);

    // Control: an empty repo (no commits) scans clean, proving the assertion below
    // isn't vacuously true.
    const controlResult = runGitleaks({ sourceDir: scratchDir, noGit: false });
    assert.equal(controlResult.status, 0, "expected an empty scratch repo to scan clean");

    writeFileSync(join(scratchDir, "config.js"), `export const SUPABASE_SERVICE_ROLE_KEY = "${FAKE_SECRET}";\n`);
    runGitCommand(["add", "."], scratchDir);
    runGitCommand(["commit", "-q", "-m", "add fake secret"], scratchDir);

    const result = runGitleaks({ sourceDir: scratchDir, noGit: false });
    assert.notEqual(result.status, 0, "expected gitleaks to flag the committed fake secret");
    assert.match(result.stdout.toLowerCase(), /leak|finding/);
  });

  await t.test("bundle-style detection: catches a fake secret appended to a built export", async () => {
    buildExport();
    const realDistDir = join(process.cwd(), "dist");

    const cleanScratchDir = makeScratchDir("gitleaks-bundle-clean-");
    const dirtyScratchDir = makeScratchDir("gitleaks-bundle-dirty-");
    t.after(() => {
      rmSync(cleanScratchDir, { recursive: true, force: true });
      rmSync(dirtyScratchDir, { recursive: true, force: true });
    });

    cpSync(realDistDir, cleanScratchDir, { recursive: true });
    cpSync(realDistDir, dirtyScratchDir, { recursive: true });

    // Control: an unmodified copy of the real export scans clean.
    const controlResult = runGitleaks({ sourceDir: cleanScratchDir });
    assert.equal(controlResult.status, 0, "expected an unmodified export copy to scan clean");

    const jsFiles = readdirSync(join(dirtyScratchDir, "_expo", "static", "js", "web")).filter((name) =>
      name.endsWith(".js"),
    );
    assert.ok(jsFiles.length > 0, "expected at least one exported JS bundle file to append the fake secret to");
    const targetFile = join(dirtyScratchDir, "_expo", "static", "js", "web", jsFiles[0]);
    writeFileSync(targetFile, `\n// injected for test\nvar leaked = "${FAKE_SECRET}";\n`, { flag: "a" });

    const result = runGitleaks({ sourceDir: dirtyScratchDir });
    assert.notEqual(result.status, 0, "expected gitleaks to flag the fake secret appended to the built bundle");
    assert.match(result.stdout.toLowerCase(), /leak|finding/);
  });
});
