# How I work with AI on this project

Most of the code in this repository was written by AI agents (Claude Code: Sonnet for most planning and implementation, Opus for higher-rigor planning). My job is the part a model can't own: product direction, architecture and invariants, what counts as "done," and the gates that decide whether generated work is trustworthy. This document explains that division of labor and shows where it worked and where it failed.

## The division of labor

**What I decide**

- **Product scope and copy.** Agents propose stories and wording. I accept, reject, or rewrite them. The `… per owner review` commits are a screen-by-screen pass where I reviewed every user-facing string and an agent applied my edits.
- **Architecture and invariants.** [`AGENTS.md`](AGENTS.md) holds the rules every agent must follow. Examples: five independent persistent domains with no global store, pure reducers that receive timestamps, an immutable practice history that Stats are derived from, name snapshots instead of live lookups, and destructive flows that fail closed. Most of these rules exist because an agent once did the opposite.
- **Exit criteria.** Every ticket in [`TASKS.md`](TASKS.md) has mechanically checkable exit criteria before any agent touches it.
- **Anything irreversible or outward-facing.** Hosted configuration, production deploys, database dashboards, and promotions to `main` go through [`TASKS_COLLABORATIVE.md`](TASKS_COLLABORATIVE.md), a queue that agents can prepare but not complete alone.

**What agents do**

- QA passes in a real browser, product audits, ticket scoping, planning, implementation, tests, and PRs into `development`.

## The pipeline

```
QA explorer → product-manager → scope-tickets → newTicket loop
 (browser)    (stories)         (tickets with     (claim → plan → implement
                                 exit criteria)     → verify → PR → squash-merge)
```

Each stage is a skill or agent definition under [`.claude/`](.claude/). The `newTicket` loop runs each ticket in fresh subagent contexts, so context never accumulates across tasks. A full unattended run is logged in [`outputs/autonomous-run-2026-09-10.md`](outputs/autonomous-run-2026-09-10.md). In that run, a browser QA pass found two high-severity bugs, and six tickets went from finding to merged PR.

### Principle: use a model only where judgment is needed

Any step that can be deterministic is a script, not a prompt ([`.claude/scripts/`](.claude/scripts/), with its own test suite, `yarn test:workflow`). Ticket claiming, the four-step verification run, worktree cleanup, and merge-status checks are all scripts. A rejected `git push` of a new `task/T###-*` branch acts as the collision detector between parallel agents, so claiming needs no lock service.

Nearly every one of those scripts exists because an agent got that step wrong. The [table in the scripts README](.claude/scripts/README.md#why-these-exist) records what each one replaced.

## Where it went wrong, and what caught it

These are real incidents from the git history and audit records.

**1. An agent "verified" code it hadn't changed.** The implementer agent's first live run reused the dev server from the main checkout instead of its own worktree. Its browser verification passed against the old code and had to be redone once the cause was found. The agent definition now starts its own dev server on an explicit port inside its worktree (`692dbce`). Lesson: when an agent reports a passing check, confirm what it actually checked.

**2. Tests passed, but data could be silently lost.** A review pass over agent-built persistence ([`DESLOPPIFY.md`](DESLOPPIFY.md), D001/D002) found two problems. A failed local save only logged `console.warn` while the UI showed the change as saved. "Discard and log out" could also proceed after a failed write. Every existing test passed, because no test injected a write failure. The fixes made saves return a typed `saved | failed | superseded` outcome through every layer, made logout fail closed, and added an app-level warning with retry. The lasting fix was a rule in `AGENTS.md`: success is reported only after the durable write completes, and fault-injection tests are required for destructive flows. Lesson: agents optimize for the tests that exist, so the important work is deciding which failure tests must exist.

**3. A security gate could report green without running.** The dependency-audit wrapper ignored the child process's exit status and treated incomplete output as "no advisories." A network failure would have passed CI (T228). It now requires a valid completion summary and has regression tests for spawn, signal, and truncated-output failures. Lesson: a resolved process is not a successful operation.

**4. My own edit broke the build, and the gates caught it.** I made a hand edit to UI copy that accidentally deleted two props. `tsc` and three component tests failed immediately, and the fix was a three-line restore (`cd02a6f`). The gates apply to me as much as to the agents.

## What I'd still improve

The agents follow `AGENTS.md` well within the code a task touches, but nothing audits the whole codebase against it. Rule drift accumulates between audits. Examples are one oversized Sesh component, and cross-feature imports of formatting helpers from component files. The next step is to turn more of those rules into lint rules or contract tests, so they fail in CI rather than waiting for a review pass.
