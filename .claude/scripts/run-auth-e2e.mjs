#!/usr/bin/env node
// T153.13: the one documented command for the black-box Phase 1 Auth acceptance suite.
// Resets local Supabase to a clean state, reads the local CLI's own status output for
// the anon/service-role keys and API URL (never hardcoded, never printed, never written
// to a tracked file), and execs Playwright against e2e/auth with those exported only
// into the child process's environment. See supabase/README.md for the email-budget
// design this single reset (not a mid-run second reset) depends on.

import { spawnSync } from 'node:child_process';

const SUPABASE_CLI = 'supabase@2.116.0';

function run(args, options) {
  return spawnSync('npx', ['--yes', SUPABASE_CLI, ...args], {
    encoding: 'utf8',
    stdio: options && options.quiet ? 'pipe' : 'inherit',
  });
}

console.log('[run-auth-e2e] Checking local Supabase status...');
const statusCheck = run(['status'], { quiet: true });
if (statusCheck.status !== 0) {
  console.log('[run-auth-e2e] Local stack not running -- starting it (this can take a minute)...');
  run(['start']);
}

console.log('[run-auth-e2e] Resetting local Supabase database (one reset for the whole run)...');
const resetResult = run(['db', 'reset']);
if (resetResult.status !== 0) {
  console.error('[run-auth-e2e] db reset failed.');
  process.exitCode = 1;
  throw new Error('db reset failed');
}

console.log('[run-auth-e2e] Reading local status output for API URL and keys (not printed)...');
const statusResult = run(['status', '-o', 'env'], { quiet: true });
if (statusResult.status !== 0) {
  console.error('[run-auth-e2e] Unable to read local Supabase status.');
  process.exitCode = 1;
  throw new Error('status failed');
}

function extract(name, text) {
  const pattern = new RegExp('^' + name + '="?([^"\n]+)"?', 'm');
  const found = text.match(pattern);
  if (!found) throw new Error('Could not find ' + name + ' in supabase status output.');
  return found[1];
}

const statusText = statusResult.stdout;
const apiUrl = extract('API_URL', statusText);
const anonKey = extract('ANON_KEY', statusText);
const serviceRoleKey = extract('SERVICE_ROLE_KEY', statusText);

console.log('[run-auth-e2e] Running Playwright acceptance suite against e2e/auth...');
const playwrightEnv = Object.assign({}, process.env, {
  EXPO_PUBLIC_SUPABASE_URL: apiUrl,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
});

const playwrightArgs = ['playwright', 'test', ...process.argv.slice(2)];
const testResult = spawnSync('npx', playwrightArgs, {
  stdio: 'inherit',
  env: playwrightEnv,
});

process.exitCode = testResult.status === null ? 1 : testResult.status;
