# newTicket workflow tooling

Deterministic scripts behind [`.claude/skills/newTicket/SKILL.md`](../skills/newTicket/SKILL.md). Node built-ins only — no install step, no dependencies. Run `yarn test:workflow` (or `node --test '.claude/scripts/test/*.test.mjs'`) after changing anything here.

## Why these exist

Every stage the workflow can perform mechanically is performed mechanically. A model context is only spent where judgement is actually required — planning a non-trivial change, and writing the code.

| Script | Replaces |
| :-- | :-- |
| `ticket-claim.mjs` | the former `ticket-claim` subagent (a fresh Sonnet context per cycle for a fixed sequence of git commands) |
| `verify.mjs` | four separate `Bash` round trips per implementation |
| `worktree-cleanup.mjs` | agents attempting to remove worktrees they cannot remove |
| `pr-merge-status.mjs` | mistaking a post-merge local `gh` failure for a rejected remote merge |
| `validate-agent-config.mjs` | discovering a broken agent definition at run time |

## `ticket-claim.mjs`

```sh
node .claude/scripts/ticket-claim.mjs                 # next actionable task
node .claude/scripts/ticket-claim.mjs T035            # named task (or --task T035)
node .claude/scripts/ticket-claim.mjs resume T034     # resume an existing claim (or T034 --resume)
node .claude/scripts/ticket-claim.mjs --dry-run       # decide without changing anything
```

Prints one JSON object on stdout and a one-line summary on stderr; exits 1 when blocked, 0 otherwise.

```jsonc
{
  "status": "claimed",          // claimed | resumed | blocked | backlog-exhausted
  "taskId": "T035",
  "title": "…",
  "branch": "task/T035-add-a-global-notes-archive",
  "entry": "### [T035] …",      // verbatim, so no stage needs to re-read TASKS.md
  "planFile": ".claude/plans/T035.md",
  "planExists": false,
  "planning": { "policy": "required", "source": "default", "reason": "…" },
  "resolvedFromParent": false,  // true when a named umbrella resolved to a child
  "skipped": [ { "id": "T039", "reason": "dependency", "detail": "…" } ]
}
```

Selection, in order: umbrella parents are passed over (their children are separate entries); non-`Not started` entries are skipped; an entry whose stated `Depends on T0NN` isn't archived in `TASKS_DONE.md` is skipped. In **continuous** mode (no requested ID), a candidate that already has a remote `task/<ID>-*` branch is likewise skipped — recorded in `skipped` with reason `claimed` — and the scan continues to the next actionable task, so one blocked/claimed task never stalls unrelated work; anything that actually depends on it stays correctly skipped by the dependency check above, since a claimed-but-unmerged task never lands in `TASKS_DONE.md`. In **named** mode (an explicit task ID) or `resume`, the same situation instead **stops the run** with `blocked` + a `resumeCommand`, since the caller asked for that specific task.

What it will not do: switch branches or write files in the checkout it's invoked from; force-push; delete a branch it doesn't own; adopt an existing claim branch outside explicit resume mode; or treat branch age as evidence a claim is stale. The claim commit and push happen inside a temporary worktree under `.claude/worktrees/newticket-claim-*` that the script removes on success and on failure.

Before creating that worktree it refuses a colliding local task branch. Every
claim commit also carries a random nonce: concurrent workers therefore create
different commit IDs, so an ordinary non-force push accepts exactly one and
rejects the other as non-fast-forward rather than treating identical commits
as the same successful claim.

`--resume` is read-only against the branch. It refuses when zero or more than one branch matches the ID, and when the branch's own `TASKS.md` doesn't contain the task.

## `verify.mjs`

```sh
node .claude/scripts/verify.mjs                 # test, lint, typecheck, web export
node .claude/scripts/verify.mjs --skip-export   # docs/test-only changes
node .claude/scripts/verify.mjs --only lint     # one step, repeatable
node .claude/scripts/verify.mjs --keep-going    # don't stop at the first failure
node .claude/scripts/verify.mjs --json          # machine-readable result
```

One line per step on success; on failure, the failing command's output tail plus a non-zero exit. The complete log of every step is always written to a temp file whose path is printed. Give it a 600000 ms tool timeout.

`--json` emits one JSON object with `status`, the planned options, per-step
status/exit code/duration/command, the first failed step when applicable, and
the complete log path. Successful steps omit their output; failed steps include
an output tail. The process exit code remains non-zero on verification failure.

## `worktree-cleanup.mjs`

```sh
node .claude/scripts/worktree-cleanup.mjs --path <dir> [--path <dir> …]
node .claude/scripts/worktree-cleanup.mjs --prefix newticket-claim-
node .claude/scripts/worktree-cleanup.mjs --list
node .claude/scripts/worktree-cleanup.mjs --release-codex-stage --task T035 --branch task/T035-short-slug
# add --dry-run to any of the above
```

Claude Code holds a `git worktree lock` on an agent's worktree for the agent's lifetime, so an agent cannot remove its own — cleanup belongs to the orchestrating session, after the call returns.

Removal requires **every** check to pass; anything else is refused and reported, never forced:

| Refusal | Meaning |
| :-- | :-- |
| `main-checkout` | it's the repository itself |
| `outside-container` | not under `.claude/worktrees/` — user-owned |
| `locked` | an agent still holds it; retry at the next checkpoint |
| `branch-checked-out` | a branch is still checked out there |
| `dirty` | uncommitted or untracked files |
| `unpushed-commits` | commits that exist on no remote |
| `active-process` | a live process has its cwd inside |
| `unverifiable` | git couldn't answer; assume unsafe |

Process detection includes descendant directories inside the worktree and
fails closed when `lsof` is unavailable or returns an unexpected error.

`--prefix` only matches direct children of `.claude/worktrees/`. Never point it at `agent-` — those are not necessarily this run's.

`--release-codex-stage` is intentionally narrow: it considers only a
`codex-ticket-<task>-*` stage for the named task, requires its exact task branch,
and then applies the normal clean/pushed/unlocked/no-process checks before
detaching and removing it. It exists solely to make a Codex resume safe; it is
not a general cleanup sweep.

## `pr-merge-status.mjs`

```sh
node .claude/scripts/pr-merge-status.mjs --pr <number-or-url>
```

Read GitHub's canonical PR state after exactly one merge attempt. A confirmed
`merged` result wins over a non-zero `gh pr merge` exit, which can occur during
local branch cleanup after GitHub has already completed the merge. The script is
read-only and never retries or changes merge settings.

## `validate-agent-config.mjs`

Static check of `.claude/agents/*.md` and `.claude/skills/*/SKILL.md` frontmatter against Claude Code 2.1.x: known fields only, valid `model`/`effort`/`isolation`, tool names that actually resolve, and no `Agent` on a subagent. Exits non-zero on any error.

Note the asymmetry it encodes: on a **subagent**, `tools:` is a real allowlist. On a **skill**, `allowed-tools` only pre-approves — `disallowed-tools` is what removes tools from the pool.
