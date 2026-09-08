#!/usr/bin/env node
// T162.3: shared helper for running gitleaks against an arbitrary local directory
// (the built web bundle, or a throwaway scratch repo used by
// verify-secret-detection.mjs). gitleaks-action (used in CI for the real repo's git
// history) only scans a checked-out repo, not an arbitrary directory, so this runs the
// official gitleaks Docker image directly, pinned by digest, for the bundle-scan and
// self-test use cases. No CLI entry point of its own -- import runGitleaks from here.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

// Pinned by digest (not just tag) so the image can't change out from under CI without
// an explicit review of this line. Update this single constant to bump the version.
export const GITLEAKS_IMAGE =
  "zricethezav/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f";

const GITLEAKS_CONFIG_PATH = resolve(REPO_ROOT, ".gitleaks.toml");

/**
 * Runs gitleaks against `sourceDir` inside a throwaway Docker container.
 *
 * @param {object} args
 * @param {string} args.sourceDir - absolute or repo-root-relative path to scan.
 * @param {boolean} [args.noGit] - true (default) scans `sourceDir` as a plain
 *   directory (the built web bundle case). false scans it as a git repository's
 *   committed history instead (used by the self-test's history-style detection case).
 * @param {string[]} [args.extraArgs] - additional args appended to `gitleaks detect`.
 * @returns {{ status: number, stdout: string }}
 */
export function runGitleaks({ sourceDir, noGit = true, extraArgs = [] }) {
  const absoluteSourceDir = resolve(REPO_ROOT, sourceDir);
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${absoluteSourceDir}:/scan:ro`,
      "-v",
      `${GITLEAKS_CONFIG_PATH}:/gitleaks.toml:ro`,
      GITLEAKS_IMAGE,
      "detect",
      ...(noGit ? ["--no-git"] : []),
      "--source=/scan",
      "--config=/gitleaks.toml",
      "--redact",
      "--exit-code=1",
      ...extraArgs,
    ],
    { encoding: "utf8" },
  );
  if (result.error) {
    throw result.error;
  }
  return { status: result.status ?? 1, stdout: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}
