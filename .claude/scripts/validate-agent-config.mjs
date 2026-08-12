#!/usr/bin/env node
// Static validation for this repo's Claude Code agent and skill definitions.
//
// Catches the failure modes that are otherwise only visible at run time:
// unknown frontmatter keys, tool names that resolve to nothing (a subagent
// whose entire `tools` list is unresolvable refuses to launch), `Agent` listed
// on a subagent that cannot spawn subagents, and invalid model/effort values.
//
// Field and tool names follow Claude Code 2.1.x:
//   https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields
//   https://code.claude.com/docs/en/skills#frontmatter-reference
//
// Usage: node .claude/scripts/validate-agent-config.mjs [--repo <path>]

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AGENT_FIELDS = new Set([
  'name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode', 'maxTurns', 'skills',
  'mcpServers', 'hooks', 'memory', 'background', 'effort', 'isolation', 'color',
]);

const SKILL_FIELDS = new Set([
  'name', 'description', 'allowed-tools', 'disallowed-tools', 'model', 'effort', 'context',
  'disable-model-invocation', 'user-invocable', 'argument-hint', 'license', 'compatibility', 'metadata',
]);

const MODELS = new Set(['sonnet', 'opus', 'haiku', 'fable', 'inherit']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

// Built-in tools a subagent can be granted. Names outside this set are only
// valid as MCP patterns (`mcp__server` / `mcp__server__tool`).
const BUILTIN_TOOLS = new Set([
  'Agent', 'Artifact', 'Bash', 'BashOutput', 'Edit', 'EnterWorktree', 'ExitWorktree', 'Glob', 'Grep',
  'KillShell', 'Monitor', 'NotebookEdit', 'Read', 'SendMessage', 'Skill', 'SlashCommand', 'TaskCreate',
  'TaskGet', 'TaskList', 'TaskStop', 'TaskUpdate', 'TodoWrite', 'ToolSearch', 'WebFetch', 'WebSearch', 'Write',
]);

/** Minimal flat-YAML frontmatter reader: `key: value` and `key:` + `- item`. */
export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return null;
  const fields = {};
  let listKey = null;
  for (const line of match[1].split('\n')) {
    if (/^\s*#/.test(line) || line.trim() === '') continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      fields[listKey].push(item[1].trim());
      continue;
    }
    const pair = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    if (pair[2].trim() === '') {
      listKey = pair[1];
      fields[listKey] = [];
    } else {
      listKey = null;
      fields[pair[1]] = pair[2].trim();
    }
  }
  return fields;
}

/**
 * Split a tool list written as a string or a YAML list.
 *
 * Separators are commas and whitespace, but only outside parentheses — a
 * permission specifier such as `Bash(git add *)` is one entry, not three.
 */
export function toolList(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map((entry) => entry.trim()).filter(Boolean);
  const entries = [];
  let current = '';
  let depth = 0;
  for (const character of String(value)) {
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[,\s]/.test(character)) {
      if (current.trim()) entries.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) entries.push(current.trim());
  return entries;
}

function checkToolNames(entries, { where, allowPermissionSyntax }) {
  const problems = [];
  let resolvable = 0;
  for (const entry of entries) {
    if (/^mcp__[A-Za-z0-9_-]+(__([A-Za-z0-9_-]+|\*))?$/.test(entry)) {
      resolvable += 1;
      continue;
    }
    const bare = allowPermissionSyntax ? entry.replace(/\(.*\)$/, '') : entry;
    if (BUILTIN_TOOLS.has(bare)) {
      resolvable += 1;
      continue;
    }
    problems.push({ level: 'error', where, message: `unknown tool ${JSON.stringify(entry)}` });
  }
  if (entries.length > 0 && resolvable === 0) {
    problems.push({
      level: 'error',
      where,
      message: 'no entry resolves to a tool — Claude Code refuses to launch a subagent with an empty tool set',
    });
  }
  return problems;
}

export function validateAgent(file, text) {
  const where = path.basename(file);
  const fields = parseFrontmatter(text);
  if (!fields) return [{ level: 'error', where, message: 'missing YAML frontmatter' }];
  const problems = [];
  for (const required of ['name', 'description']) {
    if (!fields[required]) problems.push({ level: 'error', where, message: `missing required field \`${required}\`` });
  }
  for (const key of Object.keys(fields)) {
    if (!AGENT_FIELDS.has(key)) problems.push({ level: 'error', where, message: `unknown frontmatter field \`${key}\`` });
  }
  if (fields.model && !MODELS.has(fields.model) && !/^claude-/.test(fields.model)) {
    problems.push({ level: 'error', where, message: `invalid model ${JSON.stringify(fields.model)}` });
  }
  if (fields.effort && !EFFORTS.has(fields.effort)) {
    problems.push({ level: 'error', where, message: `invalid effort ${JSON.stringify(fields.effort)}` });
  }
  if (fields.isolation && !['worktree', 'remote'].includes(fields.isolation)) {
    problems.push({ level: 'error', where, message: `invalid isolation ${JSON.stringify(fields.isolation)}` });
  }
  const tools = toolList(fields.tools);
  if (tools) {
    problems.push(...checkToolNames(tools, { where, allowPermissionSyntax: false }));
    if (tools.includes('Agent')) {
      problems.push({ level: 'error', where, message: '`Agent` listed on a subagent — subagents cannot spawn subagents' });
    }
  } else {
    problems.push({
      level: 'error',
      where,
      message: 'no `tools` allowlist — the subagent inherits every built-in and MCP tool',
    });
  }
  return problems;
}

export function validateSkill(file, text) {
  const where = path.relative(process.cwd(), file);
  const fields = parseFrontmatter(text);
  if (!fields) return [{ level: 'error', where, message: 'missing YAML frontmatter' }];
  const problems = [];
  if (!fields.description) problems.push({ level: 'error', where, message: 'missing required field `description`' });
  for (const key of Object.keys(fields)) {
    if (!SKILL_FIELDS.has(key)) problems.push({ level: 'error', where, message: `unknown frontmatter field \`${key}\`` });
  }
  for (const key of ['allowed-tools', 'disallowed-tools']) {
    const entries = toolList(fields[key]);
    if (entries) problems.push(...checkToolNames(entries, { where, allowPermissionSyntax: key === 'allowed-tools' }));
  }
  if (fields['allowed-tools'] && !fields['disallowed-tools']) {
    problems.push({
      level: 'warning',
      where,
      message: '`allowed-tools` only pre-approves tools; add `disallowed-tools` to actually restrict the pool',
    });
  }
  return problems;
}

export function validateRepo(repoRoot) {
  const problems = [];
  const agentsDir = path.join(repoRoot, '.claude', 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const entry of fs.readdirSync(agentsDir).filter((name) => name.endsWith('.md')).sort()) {
      const file = path.join(agentsDir, entry);
      problems.push(...validateAgent(file, fs.readFileSync(file, 'utf8')));
    }
  }
  const skillsDir = path.join(repoRoot, '.claude', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir).sort()) {
      const file = path.join(skillsDir, entry, 'SKILL.md');
      if (fs.existsSync(file)) problems.push(...validateSkill(file, fs.readFileSync(file, 'utf8')));
    }
  }
  return problems;
}

function main() {
  const repoIndex = process.argv.indexOf('--repo');
  const repoRoot = repoIndex === -1 ? process.cwd() : process.argv[repoIndex + 1];
  const problems = validateRepo(repoRoot);
  for (const problem of problems) {
    process.stdout.write(`${problem.level.toUpperCase()}  ${problem.where}: ${problem.message}\n`);
  }
  const errors = problems.filter((problem) => problem.level === 'error');
  process.stdout.write(
    errors.length === 0
      ? `CONFIG: OK (${problems.length} warning(s))\n`
      : `CONFIG: ${errors.length} error(s)\n`,
  );
  process.exit(errors.length === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
