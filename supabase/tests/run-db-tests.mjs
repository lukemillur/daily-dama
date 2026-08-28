#!/usr/bin/env node
// T155.8: one repeatable command that resets the local Supabase database and
// runs every migration/security test source that already exists piecemeal
// (pgTAP under supabase/tests/*.test.sql, the Data API HTTP suite under
// supabase/tests/data-api/, including the T155.8 pagination fixture),
// suitable for local work and CI. Modeled on .claude/scripts/verify.mjs's
// style: one PASS/FAIL line per step, full output on failure, single
// non-zero exit on any failure.
//
// Usage:
//   yarn test:db                       # default: start, reset, generated
//                                       # database-types drift check, pgTAP,
//                                       # Data API suite, cleanup reset
//   yarn test:db -- --mutation-check   # opt-in: prove the harness fails
//                                       # closed when a representative RLS
//                                       # policy is deliberately weakened
//
// This is a separate, explicitly-invoked command from
// `node .claude/scripts/verify.mjs` -- it requires a running local
// Supabase/Docker stack that the standard no-Docker verification sequence
// does not assume, same as `yarn test:data-api` already is today. It is not
// wired into .github/workflows/ (no existing workflow references Supabase
// yet); "suitable for... CI" describes this command's non-interactive,
// exit-code-driven behavior, not a request to add a CI job.

import { spawnSync } from 'node:child_process';

const SUPABASE = ['npx', '--yes', 'supabase@2.116.0'];

// The mutation check weakens this exact policy, defined in
// supabase/migrations/20260822200050_add_custom_tricks_and_practice_sessions.sql.
// If that policy is ever renamed or restructured, this line must move with
// it.
const MUTATION_CHECK_POLICY_SQL =
  'alter policy practice_sessions_select_own on api.practice_sessions using (true);';
const MUTATION_CHECK_TEST_FILE = 'supabase/tests/data-api/t155_7_cross_user_isolation.test.mjs';

function run(name, argv) {
  const started = Date.now();
  const proc = spawnSync(argv[0], argv.slice(1), {
    encoding: 'utf8',
    shell: false,
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, CI: '1' },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
  const code = proc.status === null ? 1 : proc.status;
  process.stdout.write(`${code === 0 ? 'PASS' : 'FAIL'}  ${name.padEnd(28)}${seconds}s\n`);
  if (code !== 0) {
    process.stdout.write(`\n--- \`${argv.join(' ')}\` (exit ${code}) ---\n${output.trim()}\n\n`);
  }
  return { name, code, output };
}

function runDefaultSequence() {
  const steps = [];

  steps.push(run('supabase start', [...SUPABASE, 'start']));
  if (steps[0].code === 0) steps.push(run('db reset', [...SUPABASE, 'db', 'reset']));
  if (steps.every((step) => step.code === 0)) {
    steps.push(
      run('db:generate-types --check', [
        'node',
        'supabase/scripts/generate-database-types.mjs',
        '--check',
        '--reuse-current-database',
      ]),
    );
  }
  if (steps.every((step) => step.code === 0)) {
    steps.push(run('pgTAP (test db --local)', [...SUPABASE, 'test', 'db', '--local']));
  }
  if (steps.every((step) => step.code === 0)) {
    steps.push(run('Data API suite (yarn test:data-api)', ['yarn', 'test:data-api']));
  }
  if (steps.every((step) => step.code === 0)) {
    steps.push(run('start before Edge Functions', [...SUPABASE, 'start']));
  }
  if (steps.every((step) => step.code === 0)) {
    steps.push(run('Edge Function suite (yarn test:functions)', ['yarn', 'test:functions']));
  }

  // Cleanup reset always runs, regardless of whether the steps above
  // succeeded, so the local stack is never left dirty by a failed run. Its
  // own result is reported but never overrides an earlier failure's exit
  // code -- a passing cleanup reset must not mask an earlier failure, and a
  // failed cleanup reset after an otherwise-passing run must still surface
  // as non-zero (a dirty stack after a "passing" run is itself a problem for
  // whoever runs this command next).
  const cleanup = run('cleanup db reset', [...SUPABASE, 'db', 'reset']);

  const earlierFailure = steps.find((step) => step.code !== 0);
  if (earlierFailure) {
    process.stdout.write(`\nDB TESTS: FAIL at "${earlierFailure.name}"\n`);
    process.exit(earlierFailure.code || 1);
  }
  if (cleanup.code !== 0) {
    process.stdout.write('\nDB TESTS: FAIL — all tests passed but the final cleanup `db reset` failed\n');
    process.exit(cleanup.code || 1);
  }
  process.stdout.write(`\nDB TESTS: PASS (${steps.length}/${steps.length} steps)\n`);
  process.exit(0);
}

function runMutationCheck() {
  process.stdout.write('Running mutation check: deliberately weakening practice_sessions_select_own...\n\n');

  const baseline = run('baseline db reset', [...SUPABASE, 'db', 'reset']);
  if (baseline.code !== 0) {
    process.stdout.write('\nMUTATION CHECK: could not establish a clean baseline; aborting\n');
    process.exit(baseline.code || 1);
  }

  const weaken = run('weaken practice_sessions_select_own', [...SUPABASE, 'db', 'query', '--local', MUTATION_CHECK_POLICY_SQL]);
  if (weaken.code !== 0) {
    process.stdout.write('\nMUTATION CHECK: could not weaken the policy; aborting (restoring via db reset)\n');
    run('restore db reset', [...SUPABASE, 'db', 'reset']);
    process.exit(weaken.code || 1);
  }

  const probe = run('cross-user isolation suite (expected to fail)', ['node', '--test', MUTATION_CHECK_TEST_FILE]);

  // Always restore the migration-defined policy, regardless of the probe's
  // outcome.
  const restore = run('restore db reset', [...SUPABASE, 'db', 'reset']);

  if (probe.code !== 0) {
    process.stdout.write('\nmutation check passed: harness detected the weakened policy\n');
    if (restore.code !== 0) {
      process.stdout.write('\nMUTATION CHECK: WARNING — the harness detected the weakened policy, but the restore `db reset` failed; the local stack may still be dirty\n');
      process.exit(restore.code || 1);
    }
    process.exit(0);
  }

  process.stdout.write('\nmutation check FAILED: a weakened RLS policy went undetected\n');
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const mutationCheck = args.includes('--mutation-check');
  const unknown = args.filter((arg) => arg !== '--mutation-check');
  if (unknown.length > 0) {
    process.stderr.write(`unrecognized argument(s): ${unknown.join(', ')}\n`);
    process.exit(2);
  }

  if (mutationCheck) runMutationCheck();
  else runDefaultSequence();
}

main();
