#!/usr/bin/env node
// Select the expensive security checks that can observe a changed boundary.
// Pull-request paths arrive on stdin from `git diff --name-only`; scheduled,
// release, main-push, and manual runs pass --all.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ALL_SCANS = Object.freeze({ dependency: true, bundle: true, selfTest: true });

function matchesPrefix(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function matchesFile(path, files) {
  return files.includes(path);
}

export function selectSecurityScans(paths) {
  const normalized = paths.map((path) => path.trim()).filter(Boolean);
  if (
    normalized.some((path) =>
      matchesFile(path, ['.github/workflows/ci.yml', 'security/scripts/select-ci-scans.mjs']),
    )
  ) {
    return ALL_SCANS;
  }

  const dependency = normalized.some(
    (path) =>
      matchesFile(path, [
        'package.json',
        'yarn.lock',
        '.yarnrc',
        '.yarnrc.yml',
        'security/accepted-dependency-advisories.json',
        'security/scripts/check-dependency-audit.mjs',
        'security/scripts/verify-dependency-audit-gate.mjs',
      ]),
  );

  const bundle = normalized.some(
    (path) =>
      matchesPrefix(path, ['src', 'assets', 'public']) ||
      matchesFile(path, [
        'package.json',
        'yarn.lock',
        'app.json',
        'app.config.js',
        'app.config.ts',
        'babel.config.js',
        'metro.config.js',
        '.gitleaks.toml',
        'security/scripts/build-and-serve.mjs',
        'security/scripts/check-bundle-secrets.mjs',
        'security/scripts/gitleaks-cli.mjs',
      ]),
  );

  const selfTest = normalized.some((path) =>
    matchesFile(path, [
      '.gitleaks.toml',
      'security/scripts/build-and-serve.mjs',
      'security/scripts/gitleaks-cli.mjs',
      'security/scripts/verify-secret-detection.mjs',
    ]),
  );

  return { dependency, bundle, selfTest };
}

// The app verify job (test/lint/tsc/export) cannot be affected by a diff
// consisting entirely of Markdown -- none of those tools read .md content.
// Mirrors the doc-only skip AGENTS.md already documents for local
// verification tiers, applied to CI's equivalent job.
export function isDocsOnlyChange(paths) {
  const normalized = paths.map((path) => path.trim()).filter(Boolean);
  return normalized.length > 0 && normalized.every((path) => path.endsWith('.md'));
}

function formatGitHubOutputs(selection, docsOnly) {
  return [
    `dependency=${selection.dependency}`,
    `bundle=${selection.bundle}`,
    `self_test=${selection.selfTest}`,
    `docs_only=${docsOnly}`,
  ].join('\n');
}

function main() {
  const isAll = process.argv.includes('--all');
  const paths = isAll ? [] : readFileSync(0, 'utf8').split('\n');
  const selection = isAll ? ALL_SCANS : selectSecurityScans(paths);
  // --all covers push/schedule/release/workflow_dispatch runs, which have no
  // single diff to inspect -- always run the app suite there.
  const docsOnly = isAll ? false : isDocsOnlyChange(paths);
  process.stdout.write(`${formatGitHubOutputs(selection, docsOnly)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
