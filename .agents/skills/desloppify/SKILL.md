---
name: desloppify
description: Audit Daily Dama for concrete reliability, maintainability, security, validation, architecture, dead-code, and UI/UX debt; maintain the findings as a prioritized DESLOPPIFY.md backlog; or implement one explicitly selected D-item and return the remaining backlog. Use for desloppify scans, cleanup audits, backlog refreshes, and follow-up work selected from DESLOPPIFY.md. Do not use for ordinary feature work or as permission for an unsolicited broad refactor.
---

# Daily Dama Desloppify

Turn code-quality concerns into an evidence-backed cleanup queue, then work through that queue one explicitly selected item at a time. Preserve the boundary between observation and implementation.

## Choose the mode

Infer the mode from the request:

- **Scan:** Review the repository and create `DESLOPPIFY.md`. Do not change application code, tests, configuration, dependencies, or existing planning files.
- **Refresh:** Recheck an existing `DESLOPPIFY.md` against current code and queues. Preserve item IDs, history, and valid completion evidence; update stale findings and add newly supported ones. This is audit-only unless the user also selects an item.
- **Implement:** Act only when the user explicitly selects one `D###` item. Revalidate it, implement that bounded cleanup, verify it proportionally, update `DESLOPPIFY.md`, and display the remaining backlog.

An initial request to scan or "desloppify this project" selects Scan, not Implement. Writing or refreshing `DESLOPPIFY.md` is the only repository mutation authorized by an audit request.

## Establish the evidence base

1. Read `AGENTS.md`, `git status --short --branch`, the current `DESLOPPIFY.md` if present, and the active planning queues: `TASKS.md`, `TASKS_COLLABORATIVE.md`, `TASKS_BACKLOG.md`, and `TASKS_DONE.md`.
2. Read relevant root handoffs and recent history before judging specialized code. Inspect user-owned diffs when useful for context, but do not rewrite them or present obviously unfinished local work as a confirmed repository defect.
3. Trace representative execution paths and boundaries rather than judging filenames or file length alone. Cover, as applicable:
   - fragile behavior, lost data, concurrency, recovery, and missing error handling;
   - duplicated domain logic, inconsistent naming or structure, and confusing ownership;
   - validation, authorization, secret/privacy handling, injection, and trust boundaries;
   - route and responsive-web UX, feedback states, accessibility fundamentals, and destructive actions;
   - dead code, unused dependencies/assets/files, stale comments, and documentation drift;
   - implementations that work today but make likely changes disproportionately risky.
4. Use searches, dependency/reference checks, focused static analysis, and read-only verification when they materially increase confidence. Do not run the complete app sequence merely to make the audit look exhaustive. Record checks not run and boundaries not verified.
5. Distinguish observed defects from inferred risks and unknowns. Do not turn taste, speculative rewrites, file size alone, generated warning counts, or missing enterprise infrastructure into backlog items without a concrete cost or failure mode.

## Reconcile other work

Search all task queues before assigning a new cleanup ID. If an existing `T###` ticket already owns the outcome, cite that ticket in the appropriate priority section with `Status: Existing ticket`; do not create a parallel `D###` item or change the authoritative ticket.

Treat current dirty files, active branches, and overlapping tickets as timing constraints. Recommend waiting when cleanup would collide with active work, requires an unsettled product decision, or crosses an approval boundary in `AGENTS.md`.

## Prioritize and write the backlog

Maintain `DESLOPPIFY.md` as a practical queue with these sections, in this order:

1. `Critical issues` — credible data loss, security/privacy exposure, broken authorization, release-blocking behavior, unrecoverable user flows, or correctness failures with serious impact.
2. `Medium cleanup items` — concrete reliability and maintainability debt, risky duplication, confusing boundaries, missing recovery, contract drift, or recurring developer friction.
3. `Nice-to-have polish` — bounded clarity, consistency, accessibility, tooling, documentation, or UX improvements with lower current impact.

Give new cleanup findings stable IDs in the form `D###`. Continue above the highest ID ever present in the file and never renumber an existing item. Within a priority section, order active items by impact, confidence, and sensible dependency sequence.

Each item must contain:

```md
### [D###] Action-oriented title

- **Status:** Ready / Wait / In progress / Blocked / Existing ticket / Done / Superseded
- **Where:** concrete files, symbols, routes, or boundaries
- **Why it matters:** observed failure or maintenance cost, with uncertainty labeled
- **Recommended change:** the smallest coherent correction and relevant verification
- **Timing:** whether it is safe now or should wait, and the reason
```

For `Done` or `Superseded` items, retain a concise dated resolution/evidence note so a later refresh does not rediscover the same work. Do not silently delete prior findings. If evidence no longer supports an unresolved item, mark it `Superseded` and explain why.

Include at the top the review date, branch/commit, dirty or stale-checkout caveats that affect confidence, and how to use the backlog. End with:

- a recommended execution order that respects dependencies and active work;
- scan evidence and limits, including commands run, unverified boundaries, and whether findings came from hosted or local evidence.

Create the file if absent. When it already exists, edit it conservatively: preserve stable IDs, user notes, statuses, and valid evidence while reconciling it with the current repository.

## Display the result

After a scan, refresh, or completed item, show the active backlog in the response, grouped as Critical, Medium, and Nice-to-have. Include ID, title, and status for every non-Done/non-Superseded item, plus the recommended next item and a link to `DESLOPPIFY.md`. Mention completed or superseded items separately in one concise line when relevant.

Do not dump the full finding explanations into chat when the linked file already contains them; the displayed list is for selection. End by inviting the user to select one item.

## Implement one selected cleanup item

1. Confirm the selected ID exists and is not owned by another active task. For an `Existing ticket` item, follow its authoritative queue workflow (`new-ticket` for `TASKS.md`, `guided-ticket` for `TASKS_COLLABORATIVE.md`) instead of implementing it as a D-item.
2. Reproduce or revalidate the finding against the current checkout. If it is stale, already fixed, or blocked by changed conditions, update the status/evidence and do not manufacture a code change.
3. State what good enough means for this item. If the solution would materially change an architecture, persistence/state boundary, auth, infrastructure, or product scope named in `AGENTS.md`, present the plan and obtain approval before that change. Routine bounded cleanup may proceed autonomously.
4. Mark the item `In progress` when implementation starts. Keep the diff focused; nearby cleanup belongs in a new backlog item unless it is necessary for coherence or correctness.
5. Add or update meaningful tests for behavioral risk. Apply the repository's risk-based verification tier and record actual evidence. A typecheck, mock, export, or unit test does not substitute for a required browser, hosted service, database, Auth, or security boundary.
6. Mark the item `Done` only when its intended outcome and applicable verification pass. Add the completion date, concise change summary, evidence, and any remaining limitation. On a real blocker, use `Blocked` with the exact unmet gate; do not weaken the item to call it complete.
7. Display the remaining active backlog again and recommend the next dependency-safe item. Stop after the selected item; never roll automatically into another cleanup task.

Preserve unrelated work throughout. This skill grants no additional Git publication, deployment, destructive-action, mobile-platform, or external-service authority.
