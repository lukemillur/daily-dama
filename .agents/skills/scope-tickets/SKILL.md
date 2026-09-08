---
name: scope-tickets
description: Turn Ready-for-scoping Daily Dama planning items in BACKLOG_STORIES.md into mechanically verifiable engineering tickets, using repository context to determine area, dependencies, planning rigor, and exit criteria. Use when the user asks to scope, promote, or convert approved stories, roadmap capabilities, technical enablers, security controls, or launch gates into TASKS.md or the non-automated TASKS_BACKLOG.md.
---

# Daily Dama Ticket Scoping

Translate approved outcomes into buildable tickets without re-litigating settled product value. Inspect the real codebase, keep each ticket to one focused commit, and make completion mechanically checkable.

## Resolve input and destination

Resolve named IDs or all entries with `Status: Ready for scoping` in `BACKLOG_STORIES.md`. Stop on a named item that is not ready.

Choose the destination deliberately:

- Default roadmap, PRD, or large batch conversions to `TASKS_BACKLOG.md`. This is the formal, scoped queue excluded from `newTicket` automation.
- Write to `TASKS.md` only when the user explicitly wants work activated in the automated queue.
- Use `TASKS_COLLABORATIVE.md` when the user selects guided execution for tickets with owner decisions or external gates. Read its working agreement and include `Execution`, `Owner gates`, and `Automation boundary`; a named owner decision can remain pending there, provided it is an explicit gate before dependent work.
- Never move existing tickets between queues as a side effect of scoping unrelated work.

If the destination is ambiguous for a small item, state the reversible assumption and prefer `TASKS_BACKLOG.md`.

## Gather implementation context

Read:

1. `AGENTS.md`, including persistence boundaries and active platform scope.
2. `TASKS.md` top to bottom for format, planning rules, and active work.
3. `TASKS_BACKLOG.md`, `TASKS_COLLABORATIVE.md` (when present), and `TASKS_DONE.md` for IDs, overlap, and dependencies.
4. The source planning items and their cited documents.
5. Relevant handoffs, routes, components, providers, reducers, persistence adapters, deployment files, migrations, and tests.

Do not guess from filenames. Trace enough implementation context to identify the correct boundary and a realistic exit criterion. Follow the destination file's current conventions when they differ from this skill.

## Shape tickets

For each planning item:

- Keep one ticket inside one feature area, persistence domain, security boundary, or operational surface.
- Target one focused commit and one coherent exit criterion.
- Use a numbered umbrella plus S-sized children only for a genuinely sequential chain.
- Record dependencies explicitly; do not rely on list order alone.
- Set `Planning: Required` for backend/provider adoption, auth, schemas or migrations, persistence, state machines, synchronization, concurrency, security boundaries, unfamiliar APIs, external-service configuration, or expensive-to-reverse work.
- Use `Planning: Implementer` only for local work following a known pattern with no open decisions.
- Make exit criteria executable or inspectable: tests, commands, negative security cases, migration rebuilds, or specific browser behavior.
- Keep reducers unaware of network clients and preserve the repository's documented persistence ownership.

Do not scope native-only work into the active queue while mobile hardening is deferred. Leave its planning item `Proposed`, unless the user explicitly requests a formally deferred native ticket in `TASKS_BACKLOG.md`.

Use the next unused task ID across `TASKS.md`, `TASKS_BACKLOG.md`, `TASKS_COLLABORATIVE.md` (when present), and `TASKS_DONE.md`.

```md
### [T###] <short imperative title>

- **Area:** <one area or boundary>
- **Priority:** High / Medium / Low
- **Status:** Not started
- **Planning:** Required / Implementer
- **Description:** <change and reason in 1–3 sentences>
- **Exit criteria:** <one coherent mechanical verification>
- **Notes:** <source item, dependencies, assumptions, deferred work>
```

## Preserve traceability

Add a batch note above the new ticket range naming the source planning IDs and document sections. For each promoted item:

1. Write all destination tickets.
2. Change only its status to `Scoped → T###` or the resulting range.
3. Remove that item from `BACKLOG_STORIES.md` after recording the mapping in the destination batch note.

Never delete proposed, rejected, deferred, or sent-back items. Summarize every removed planning item and resulting ticket mapping in the final response.

## Review in Codex

Do not edit or reuse `.claude/skills/scope-tickets`; its Claude Code review artifacts are a separate workflow.

For Codex runs, present a compact story-to-ticket mapping and call out umbrellas, dependencies, and planning decisions. When an interactive review would materially help and the `visualize` skill is available, use it to publish a Codex-native review surface. Otherwise provide a Markdown review; an interactive artifact is not a completion requirement.

Apply feedback directly when it changes technical scoping. Send product-level reversals back to `product-manager` rather than silently changing the underlying outcome.

## Validate safely

Before writing, inspect git status and preserve unrelated changes. Check duplicate IDs, existing overlap, dependency references, and destination intent.

After writing:

- inspect diffs for `BACKLOG_STORIES.md` and the destination file;
- verify every ticket has all required fields and a mechanical exit criterion;
- verify every dependency names a real ticket or completed prerequisite;
- verify each promoted planning item was removed and no other item changed;
- verify `.claude/skills` has no diff.

Do not run the application test suite for planning-document-only changes.
