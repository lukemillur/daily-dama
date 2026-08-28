import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter, toolList, validateAgent, validateRepo, validateSkill } from '../validate-agent-config.mjs';
import {
  buildStepArgv,
  formatFailureResult,
  parseArgs as parseVerifyArgs,
  planSteps,
  STEPS,
} from '../verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

test('frontmatter parsing handles scalars and YAML lists', () => {
  const fields = parseFrontmatter('---\nname: x\ntools: Read, Bash\nskills:\n  - one\n  - two\n---\nbody\n');
  assert.equal(fields.name, 'x');
  assert.equal(fields.tools, 'Read, Bash');
  assert.deepEqual(fields.skills, ['one', 'two']);
  assert.equal(parseFrontmatter('no frontmatter here'), null);
});

test('tool lists split on commas and spaces but keep permission specifiers intact', () => {
  assert.deepEqual(toolList('Read, Grep, Bash'), ['Read', 'Grep', 'Bash']);
  assert.deepEqual(toolList('Bash(git add *) Bash(git commit *)'), ['Bash(git add *)', 'Bash(git commit *)']);
  assert.deepEqual(toolList(['Read', 'Bash']), ['Read', 'Bash']);
  assert.equal(toolList(undefined), null);
});

test('agent validation rejects Agent, unknown fields, bad models and unknown tools', () => {
  const bad = [
    '---',
    'name: broken',
    'description: d',
    'tools: Read, Agent, Nonsense',
    'model: gpt-4',
    'effort: extreme',
    'isolation: sandbox',
    'colour: red',
    '---',
    '',
  ].join('\n');
  const messages = validateAgent('/x/broken.md', bad).map((problem) => problem.message);
  assert.ok(messages.some((message) => /`Agent` listed on a subagent/.test(message)));
  assert.ok(messages.some((message) => /unknown tool "Nonsense"/.test(message)));
  assert.ok(messages.some((message) => /invalid model/.test(message)));
  assert.ok(messages.some((message) => /invalid effort/.test(message)));
  assert.ok(messages.some((message) => /invalid isolation/.test(message)));
  assert.ok(messages.some((message) => /unknown frontmatter field `colour`/.test(message)));
});

test('agent validation flags a subagent with no tools allowlist', () => {
  const messages = validateAgent('/x/open.md', '---\nname: open\ndescription: d\n---\n').map((p) => p.message);
  assert.ok(messages.some((message) => /no `tools` allowlist/.test(message)));
});

test('agent validation flags an allowlist where nothing resolves', () => {
  const definition = '---\nname: empty\ndescription: d\ntools: Nope, AlsoNope\n---\n';
  const messages = validateAgent('/x/empty.md', definition).map((problem) => problem.message);
  assert.ok(messages.some((message) => /no entry resolves to a tool/.test(message)));
});

test('agent validation accepts MCP server patterns', () => {
  const definition = '---\nname: ok\ndescription: d\ntools: Read, mcp__Claude_Browser__*, mcp__github\n---\n';
  assert.deepEqual(validateAgent('/x/ok.md', definition), []);
});

test('skill validation warns that allowed-tools alone does not restrict anything', () => {
  const definition = '---\nname: s\ndescription: d\nallowed-tools: Read\n---\n';
  const problems = validateSkill('/x/SKILL.md', definition);
  assert.equal(problems.filter((problem) => problem.level === 'error').length, 0);
  assert.ok(problems.some((problem) => problem.level === 'warning' && /pre-approves/.test(problem.message)));
});

test('this repository’s agent and skill definitions are valid', () => {
  const problems = validateRepo(repoRoot);
  const errors = problems.filter((problem) => problem.level === 'error');
  assert.deepEqual(errors, [], errors.map((problem) => `${problem.where}: ${problem.message}`).join('\n'));
});

test('the newTicket skill restricts as well as pre-approves', () => {
  const skill = fs.readFileSync(path.join(repoRoot, '.claude/skills/newTicket/SKILL.md'), 'utf8');
  const fields = parseFrontmatter(skill);
  const disallowed = toolList(fields['disallowed-tools']);
  for (const tool of ['Edit', 'Write', 'NotebookEdit', 'Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']) {
    assert.ok(disallowed.includes(tool), `${tool} must be removed from the orchestrator's pool`);
  }
  const allowed = toolList(fields['allowed-tools']);
  assert.deepEqual(
    allowed.filter((tool) => tool.startsWith('Agent')),
    ['Agent(ticket-planner)', 'Agent(ticket-implementer)'],
    'the orchestrator may spawn only the two ticket agents',
  );
  assert.equal(allowed.some((tool) => tool === 'Bash' || tool === 'Bash(*)'), false, 'generic Bash is not pre-approved');
});

test('newTicket continuous mode explicitly continues after recoverable blocks', () => {
  const skill = fs.readFileSync(path.join(repoRoot, '.claude/skills/newTicket/SKILL.md'), 'utf8');
  assert.match(skill, /After cleanup, return to step 1 immediately/);
  assert.match(skill, /invoke the next claim immediately in this same turn/);
  assert.match(skill, /The only outcomes that end continuous mode are a\s+claim-mechanism failure, a usage limit, or an exhausted backlog/);
  assert.match(skill, /planner-side GitHub authentication\/network\/push failures/);
  assert.match(skill, /failure must not terminate continuous mode/);
});

test('no subagent can spawn subagents', () => {
  const agentsDir = path.join(repoRoot, '.claude/agents');
  const agents = fs.readdirSync(agentsDir).filter((name) => name.endsWith('.md'));
  assert.ok(agents.length > 0);
  for (const name of agents) {
    const fields = parseFrontmatter(fs.readFileSync(path.join(agentsDir, name), 'utf8'));
    assert.ok(fields.tools, `${name} must declare a tools allowlist`);
    assert.equal(toolList(fields.tools).includes('Agent'), false, `${name} must not list Agent`);
  }
});

test('the removed ticket-claim subagent has no definition left behind', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, '.claude/agents/ticket-claim.md')), false);
});

test('the planner runs at medium effort and cannot edit code', () => {
  const fields = parseFrontmatter(fs.readFileSync(path.join(repoRoot, '.claude/agents/ticket-planner.md'), 'utf8'));
  assert.equal(fields.effort, 'medium');
  const tools = toolList(fields.tools);
  assert.equal(tools.includes('Edit'), false);
  assert.equal(tools.includes('NotebookEdit'), false);
  assert.ok(tools.includes('Write'), 'the planner still writes its plan file');
});

test('verify wrapper: step planning', () => {
  assert.deepEqual(planSteps(parseVerifyArgs([])).map((step) => step.name), STEPS.map((step) => step.name));
  assert.deepEqual(
    planSteps(parseVerifyArgs(['--skip-export'])).map((step) => step.name),
    ['test', 'lint', 'typecheck'],
  );
  assert.deepEqual(planSteps(parseVerifyArgs(['--only', 'lint'])).map((step) => step.name), ['lint']);
  const targeted = parseVerifyArgs(['--test-file', 'src/example.test.ts', '--test-file', 'src/other.test.ts']);
  assert.deepEqual(targeted.only, ['test']);
  assert.deepEqual(targeted.testFiles, ['src/example.test.ts', 'src/other.test.ts']);
  assert.deepEqual(
    buildStepArgv(STEPS[0], targeted, '/tmp/export'),
    ['yarn', 'test', '--runInBand', '--runTestsByPath', 'src/example.test.ts', 'src/other.test.ts'],
  );
  assert.equal(parseVerifyArgs(['--json']).json, true);
  assert.equal(parseVerifyArgs(['--skip-export', '--json']).json, true);
  assert.throws(() => parseVerifyArgs(['--only', 'nope']), /unknown step/);
  assert.throws(() => parseVerifyArgs(['--only']), /requires a step name/);
  assert.throws(() => parseVerifyArgs(['--test-file']), /requires a test file path/);
  assert.throws(() => parseVerifyArgs(['--only', 'lint', '--test-file', 'x.test.ts']), /only be combined/);
  assert.throws(() => parseVerifyArgs(['--wat']), /unrecognized argument/);
});

test('verify wrapper runs the documented commands in the documented order', () => {
  assert.deepEqual(
    STEPS.map((step) => step.argv.filter(Boolean).join(' ')),
    [
      'yarn test --runInBand',
      'yarn lint',
      'yarn tsc --noEmit',
      'yarn expo export --platform web --output-dir',
    ],
  );
});

test('verify wrapper failure output uses the stored command and output tail', () => {
  assert.equal(
    formatFailureResult({ command: 'yarn lint', code: 1, outputTail: 'lint failed' }),
    '\n--- `yarn lint` (exit 1) ---\nlint failed\n',
  );
});
