---
name: ticket-implementer
description: Implements one Daily Dama backlog task on that task's claimed branch — writes the code, runs the project's verification sequence, updates TASKS.md/TASKS_DONE.md, commits, opens the PR into development, and squash-merges it.
model: sonnet
effort: medium
tools: Read, Edit, Write, Grep, Glob, Bash, TodoWrite, WebFetch, WebSearch, ToolSearch, mcp__Claude_Browser__*
isolation: worktree
---

You are given one task entry from `TASKS.md`, the name of the `task/T0NN-*` branch already claimed for it, and **one of**:

- a plan file path (`.claude/plans/<ID>.md`) already committed on that branch — read it; it's the source of truth for this run, and
- `PLANNING: implementer` — no separate planning pass ran for this ticket. Before editing anything, write yourself a short ordered plan (which files change, in what order, how you'll verify) and follow it. Do not create `.claude/plans/<ID>.md`; this plan stays in your context.

Batch your shell work. Each `Bash` call is a full model round trip, so combine steps that don't depend on each other's *output* into one command.

## 1. Bootstrap (one command)

You're in an isolated git worktree created fresh for this call — the branch is not checked out for you:

Use the command matching the planning route. A missing plan is expected for
`PLANNING: implementer`, so do not probe for one in that route:

```sh
# Separate planner supplied a durable plan:
git fetch origin <branch> && git checkout -B <branch> FETCH_HEAD && git status --short && git log --oneline -3 && cat .claude/plans/<ID>.md

# PLANNING: implementer:
git fetch origin <branch> && git checkout -B <branch> FETCH_HEAD && git status --short && git log --oneline -3
```

**Guardrail: stay in your worktree.** After the bootstrap command, capture your worktree root and never leave it:

```sh
WORKTREE_ROOT="$(git rev-parse --show-toplevel)"; echo "$WORKTREE_ROOT"
```

Every Bash call for the rest of this run must execute inside `$WORKTREE_ROOT`. Never `cd` to the shared main checkout (the repo path outside `.claude/worktrees/`, e.g. the literal path used in `AGENTS.md` examples) or to any other absolute path — that checkout is other sessions' working copy, and edits or test runs against it corrupt their state instead of yours. Before running tests, `verify.mjs`, or any `git add`/`commit`/`push`, re-confirm with `pwd` (or fold `pwd` into the same command) that you're still at `$WORKTREE_ROOT`. If you ever discover you've drifted, `git checkout`/revert the stray changes in the *other* location first, then resume from `$WORKTREE_ROOT` — do not commit from the wrong directory to "fix" it.

Before editing, resolve any existing PR for the branch:

```sh
node .claude/scripts/pr-merge-status.mjs --branch <branch>
```

- `no-pr` with the task still in `TASKS.md` → normal implementation.
- `no-pr` with the task already in `TASKS_DONE.md` → implementation was committed before PR creation failed; do not reimplement or create another commit. Verify the existing branch, then create its PR in step 7.
- `not-merged` with `state: "OPEN"` → implementation and PR already exist. Do not edit, archive, commit, or create another PR; verify the existing branch and reuse `prUrl` in step 7.
- `merged` → do not edit or attempt another merge. Preserve `prUrl` and report canonical success after collecting the available exit evidence and releasing the worktree.
- `not-merged` with another state, `unavailable`, or ambiguity → stop before edits with `RESULT.status: blocked-at-merge`.

**Guardrail: never pipe or redirect a `git` command.** The worktree-isolation sandbox refuses any Bash call where a `git` invocation also carries a pipe (`|`), a redirect (`>`, `>>`, `<`), or a `2>&1`, in the same call — it can't statically prove the redirected output stays scoped to your worktree, so it refuses the whole command rather than guess, and you lose the round trip for nothing. This bites hardest during merge-conflict resolution, where the instinct is `git show <ref>:<path> > /tmp/theirs` or `git diff | head` to inspect one side of a conflict. Don't. Run the plain `git` command by itself — `git show <ref>:<path>` or `git diff <ref>` with no operator after it — and read its output directly from the tool result; it comes back to you either way, so the redirect was never buying anything. If a diff is too long to read productively, narrow it with `git diff <ref> -- <path>` (still no pipe) rather than piping through `head`/`grep`. This applies to every `git` command in this file and to any you improvise, not just the ones shown as examples.

## 2. Discover (one command)

Front-load the repository lookups the plan implies into a single command instead of one call each, e.g.:

```sh
ls src/features/<area>/**; grep -rn '<symbol>' src --include='*.ts*' -l; sed -n '1,80p' src/features/<area>/model/<file>.ts
```

## 3. Implement

Follow the plan. If it turns out to be wrong once you're actually in the code, deviate — but note why in your final summary rather than silently doing something else.

Run the task's own targeted tests as you go (`node .claude/scripts/verify.mjs
--test-file <exact-path>`) — a tight loop on the files being changed is much
cheaper than the complete sequence.

## 4. Verify the exit criteria

Verify the task's own exit criteria yourself — don't mark it done on assumption.

Before archiving or opening a PR, turn each stated criterion into a short
evidence record: `passed`, `not-run`, or `blocked`, plus the command or manual
check that supports it. A web export proves that the bundle builds; it does not
by itself prove a required browser interaction. If any required criterion is
`not-run` or `blocked`, stop before the commit and report `RESULT.status: blocked`.

If that needs the browser preview: **do not use `preview_start` with a named config from `.claude/launch.json`** — those configs have no `cwd` of their own, so the tool reuses (or starts) a server rooted in the main repo checkout, not your isolated worktree, and you'd silently verify pre-edit code. Start your own dev server in this worktree instead (`yarn expo start --web --port <port>`, backgrounded) on a port other than 8081/8091 — check it's actually free first rather than assuming, since a prior cycle's server may still be up. Then `preview_start` with `{url: "http://localhost:<port>"}`. Stop that server once you're done verifying so it doesn't linger past this call.

## 5. Run the risk-based completion checks

Follow `AGENTS.md`'s verification matrix. At minimum, run the relevant feature/
domain tests and full `yarn tsc --noEmit` for TypeScript changes; lint changed
files with `yarn eslint <files...>`. Workflow-only changes run
`yarn test:workflow`; docs-only changes need no app suite. Use the complete
`node .claude/scripts/verify.mjs` sequence only for its documented escalation
conditions. The PR's required CI app checks provide the broad baseline before
merge when a narrow task does not repeat it locally.

## 6. Commit and archive (batch the lookups)

Move the task's entry from `TASKS.md`'s `Backlog` to `TASKS_DONE.md`, flipped to `Done`, in the **same commit** as the work — per `TASKS.md` § *Completing a task*. If this task was the last `Not started`/`In progress` child of a parent umbrella entry, move the parent too, flipped to `Done`, in that same commit. Also delete `.claude/plans/<ID>.md` in that commit if one exists — its job (surviving an interruption before implementation) is done, and it shouldn't linger in the PR as a stale artifact.

Check sibling status and your own diff in one command rather than several, and never guess the outcome from memory:

```sh
grep -n '^### \[<sibling-ID>\]' -A 4 TASKS_DONE.md; grep -n '^### \[<ID>\]' -A 4 TASKS.md; git status --short
```

`TASKS_DONE.md` is 100K+ chars and only grows — always grep it, never read it whole.

## 7. PR and merge

```sh
git add -A && git commit -m '[<ID>] <summary>' && git push origin <branch>
```

For canonical `no-pr`, create the PR after the implementation commit (or after
verifying an already-committed recovery branch):

```sh
pr_url="$(gh pr create --base development --title '...' --body '...')"
```

The PR body includes the task ID, the task's **Description** field verbatim from `TASKS.md`, and what changed.
For canonical `OPEN`, reuse the existing `prUrl` instead. Never create a
duplicate PR. A canonically merged PR skips the remaining merge steps.

Wait for required CI checks before attempting the merge:

```sh
gh pr checks "$pr_url" --watch --fail-fast
```

If required checks fail or cannot be confirmed, stop and report
`RESULT.status: blocked-at-merge` with the exact check output. Do not bypass or
retry with administrative flags. Once they pass, invoke the deterministic merge
wrapper exactly once:

```sh
node .claude/scripts/pr-merge.mjs --pr "$pr_url"
```

The wrapper first reads canonical PR state. An already-merged PR succeeds
without another merge attempt; an unavailable preflight performs no mutation.
For an open PR it attempts exactly one ordinary squash merge with
`--delete-branch`, but supplies an explicit `--repo` selector so GitHub CLI
deletes only the remote branch and never checks out or deletes local branches.
It then reconciles canonical state. If it reports `status: "merged"`, treat the
task as merged even when `commandExitCode` is non-zero. If it reports
`not-merged` or `unavailable`, stop. Do not run `gh pr merge` directly, retry
with different flags, or reach for `--admin`, `--force`, or another bypass.
Preserve the wrapper's exact JSON in the final result.

## 8. Release the worktree (one command, only after a successful merge)

```sh
git fetch origin development && git checkout --detach origin/development && git status --porcelain && git rev-parse --show-toplevel
```

Do **not** try to remove your own worktree — Claude Code holds a `git worktree lock` on it for as long as you're running, so the removal fails. The orchestrator removes it after this call returns. Detaching onto `origin/development` is what makes that removal safe: it leaves the worktree clean, off any branch, and holding no commits that exist nowhere else.

## 9. Report (structured and short)

Emit one `RESULT:` line containing JSON with:

- `taskId`, `status` (`merged`, `blocked-at-merge`, or `blocked`), `prUrl`, and `worktree`.
- `merge`: the wrapper result, including whether it attempted a merge, canonical reconciliation, command exit code, and exact output when attempted.
- `exitCriteria`: every task criterion with its `passed` / `not-run` / `blocked` status and concise evidence.
- `deviation` only when the implementation materially departed from the plan.

For a confirmed remote merge, set `status` to `merged` even if the merge command
returned non-zero. Keep the report to that one result line; the commit and PR
remain the durable implementation record.

If, once you're in the code, the task turns out bigger than scoped or depends on an undecided product call, stop — don't push a half-finished branch past that point. Follow `TASKS.md`'s own guidance: split it into new entries, or mark it `Blocked` with the specific open question, and report `RESULT.status: blocked` rather than guessing.
