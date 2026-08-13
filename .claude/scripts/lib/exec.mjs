// Injectable command execution.
//
// Every git/network effect in these scripts goes through a `run` function with
// this shape, so tests can substitute a fake and assert on the exact argv that
// would have been executed without touching a real repository or remote.
//
// Built-in modules only — these scripts must work with a bare `node` and no
// install step.

import { spawnSync } from 'node:child_process';

/**
 * @typedef {(argv: string[], options?: {cwd?: string, allowFailure?: boolean, input?: string}) => RunResult} Runner
 * @typedef {{argv: string[], cwd: string, code: number, stdout: string, stderr: string}} RunResult
 */

export class CommandError extends Error {
  constructor(result) {
    super(`command failed (${result.code}): ${result.argv.join(' ')}\n${result.stderr.trim()}`);
    this.name = 'CommandError';
    this.result = result;
  }
}

/**
 * Real command runner.
 *
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv, trace?: (result: RunResult) => void}} [options]
 * @returns {Runner}
 */
export function createRunner({ cwd = process.cwd(), env = process.env, trace } = {}) {
  return function run(argv, options = {}) {
    const runCwd = options.cwd ?? cwd;
    const proc = spawnSync(argv[0], argv.slice(1), {
      cwd: runCwd,
      env,
      encoding: 'utf8',
      input: options.input,
      shell: false,
      maxBuffer: 64 * 1024 * 1024,
    });
    const result = {
      argv,
      cwd: runCwd,
      code: proc.status === null ? 1 : proc.status,
      stdout: proc.stdout ?? '',
      stderr: proc.stderr ?? (proc.error ? String(proc.error.message) : ''),
    };
    if (trace) trace(result);
    if (result.code !== 0 && !options.allowFailure) throw new CommandError(result);
    return result;
  };
}

/**
 * Test runner. `responses` maps a matcher to a canned result.
 *
 * A matcher is either an exact argv string (`'git rev-parse --show-toplevel'`)
 * or a RegExp tested against the joined argv. Later entries win, so a test can
 * register a broad default and then override one command.
 *
 * @param {Array<[string|RegExp, Partial<RunResult>|((argv: string[]) => Partial<RunResult>)]>} responses
 * @returns {Runner & {calls: string[][]}}
 */
export function createFakeRunner(responses = []) {
  const calls = [];
  const run = (argv, options = {}) => {
    calls.push(argv);
    const joined = argv.join(' ');
    let match;
    for (const [matcher, response] of responses) {
      const hit = matcher instanceof RegExp ? matcher.test(joined) : matcher === joined;
      if (hit) match = response;
    }
    const resolved = typeof match === 'function' ? match(argv) : match;
    const result = {
      argv,
      cwd: options.cwd ?? '/fake',
      code: 0,
      stdout: '',
      stderr: '',
      ...(resolved ?? {}),
    };
    if (result.code !== 0 && !options.allowFailure) throw new CommandError(result);
    return result;
  };
  run.calls = calls;
  return run;
}
