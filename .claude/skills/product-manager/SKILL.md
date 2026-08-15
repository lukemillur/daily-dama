---
name: product-manager
description: Audit the Daily Dama product and repository, identify evidence-based product opportunities, prioritize them against the current product direction, and turn selected opportunities into small, mechanically verifiable backlog tasks. Use when the user asks to populate, refine, prioritize, prune, or review the Daily Dama backlog, or asks what valuable work should happen next.
---

# Daily Dama Product Manager

Maintain a healthy supply of valuable, buildable Daily Dama work without generating backlog noise. This skill is a product-thinking and backlog-shaping workflow; it does not implement application code and it does not run the `newTicket` implementation workflow.

## Operating modes

Infer the mode from the request. If it is ambiguous, perform a read-only audit and ask what should be promoted.

- **Audit**: inspect the product context, current backlog, recent work, routes, tests, and obvious UX friction. Report evidence, opportunities, risks, and the recommended next bet. Do not edit `TASKS.md`.
- **Propose**: generate a small set of new opportunities, normally three to five. Record them in `OPPORTUNITIES.md` only if that file already exists or the user explicitly asks to maintain the opportunity log. Do not create actionable task entries yet.
- **Refine**: turn a named opportunity into one or more candidate tickets with scope, acceptance criteria, dependencies, and a recommendation about whether it belongs in `Needs scoping` or `Backlog`.
- **Promote**: after explicit authorization, update `TASKS.md` using its existing format and scoping rules. Preserve task IDs, ordering conventions, comments, and unrelated work.
- **Prioritize**: rank existing `Needs scoping` and `Backlog` work against the current product objective. Explain meaningful reorderings; do not rewrite history in `TASKS_DONE.md`.
- **Prune**: identify stale, duplicated, over-scoped, or directionally weak work. Recommend removal, merging, downgrading, or deferral. Delete or rewrite entries only when explicitly authorized.

## Context gathering

Read these sources before making product recommendations, in this order:

1. `AGENTS.md`, including the Daily Dama handoff embedded in it.
2. `TASKS.md` from top to bottom, including its scoping rules and active platform scope.
3. `TASKS_DONE.md` when recent history or completed work is relevant.
4. Relevant feature handoffs, especially `TRICK_VIZ_HANDOFF.md` or `DEPLOYMENT_HANDOFF.md`, only when the opportunity touches those areas.
5. Recent commits and the current working tree status.
6. The relevant routes, components, domain logic, persistence code, and tests needed to support an observation.

Do not infer product evidence from filenames alone. Trace an observation to a user-visible behavior, a missing flow, a test gap, a documented constraint, or a recent change. Distinguish:

- **Observed**: directly supported by repository evidence.
- **Inferred**: a reasonable interpretation of observed behavior.
- **Unknown**: requires the user's product judgment or real-user evidence.

If a durable product premise is missing, ask no more than three focused questions. Ask before promoting work when the answer would materially change the product direction. For non-blocking uncertainty, state the assumption and continue with a reversible recommendation.

Useful context questions include:

- Who is the next iteration primarily for: the maker, a new kendama learner, or an existing practitioner?
- Which current outcome matters most: first-session comprehension, repeat practice, progression, delight, or portfolio quality?
- Should this iteration favor user-facing product bets, visual polish, technical resilience, or learning experiments?

Do not ask these questions repeatedly once the answer is recorded in an existing product document or in the conversation.

## Opportunity discipline

An opportunity is not a ticket. Keep opportunities problem- and outcome-oriented until the product decision is clear.

Use this shape when proposing one:

```md
### Opportunity: <user problem or product gap>

- **Evidence:** <specific repository or user evidence>
- **Desired outcome:** <observable improvement>
- **Why now:** <relationship to current iteration>
- **Possible bets:** <two or three deliberately different interventions>
- **Smallest useful experiment:** <what can be learned with limited implementation>
- **Unknowns:** <questions that could change the recommendation>
- **Recommendation:** <one bet, or explain why more context is needed>
- **Status:** Proposed / Selected / Deferred / Rejected
```

Prefer opportunities that improve the core loop: discovering an interesting trick, choosing a session, practicing, completing, returning, and understanding progress. Also surface technical work when it protects that loop, reduces meaningful risk, or improves the ability to explore.

Do not manufacture features merely to keep agents occupied. Reject or defer ideas that are decorative, generic, duplicative, unsupported by evidence, or too large to validate in a narrow iteration.

## Prioritization

Use this qualitative model rather than pretending to know precise numbers:

```text
priority = expected product value × confidence × learning value ÷ effort
```

Rate each factor High, Medium, or Low and explain the rating in one sentence. Apply a downward adjustment when the work introduces a new persistence domain, backend, authentication, native dependency, or architectural boundary without a demonstrated need.

Maintain a balanced queue, using this as a default heuristic rather than a quota:

- 40% core-loop and user-value improvements
- 20% UX, visual identity, and interaction polish
- 20% technical quality, testing, and resilience
- 10% discovery or learning experiments
- 10% documentation and developer-experience improvements

The current iteration objective overrides this mix. A backlog review should identify the next one to three best bets, not produce a fully ordered list of every conceivable idea.

## Ticket shaping

When refining or promoting work, follow `TASKS.md` exactly:

- Raw ideas stay in `Needs scoping` with a name and one-line description.
- Actionable backlog entries must have one area, one coherent exit criterion, no unresolved product or technical decision, and fit in one focused commit.
- Use an umbrella plus numbered children only for a genuinely sequential chain of S-sized tasks.
- Set `Planning: Required` for persistence/schema changes, state machines, concurrency, architectural boundaries, unfamiliar APIs, or expensive-to-undo work. Use `Implementer` only for genuinely local S-sized work.
- Make exit criteria mechanical and checkable: tests, commands, or a specific browser behavior. Never use “looks right” as the sole criterion.
- Include deferred work and assumptions in `Notes`; do not smuggle a second feature into the ticket.
- Respect the repository's web-only active scope. Do not create native implementation or validation work unless the user explicitly resumes mobile hardening.
- Do not move completed entries or rewrite historical task records as part of ordinary backlog generation.

Use this format when drafting a ticket:

```md
### [T###] <short imperative title>

- **Area:** <one feature area or persistence domain>
- **Priority:** High / Medium / Low
- **Status:** Not started
- **Planning:** Required / Implementer
- **Description:** <what changes and why, in 1–3 sentences>
- **Exit criteria:** <one coherent, mechanical verification>
- **Notes:** <assumptions, dependencies, deferred ideas>
```

Before promotion, check for duplicate IDs, existing related tasks, dependencies not yet in `TASKS_DONE.md`, and conflicts with dirty user changes. Never overwrite unrelated edits.

## Review output

Keep reports decision-oriented. A normal audit should contain:

1. **Iteration objective** — the current objective, or the smallest assumption if none is documented.
2. **Evidence** — three to seven concrete observations with file or task references.
3. **Opportunities** — the most important candidate problems, not a feature dump.
4. **Recommendation** — the next one to three bets, with value, confidence, learning value, and effort.
5. **Proposed ticket(s)** — only when requested or clearly authorized.
6. **Questions / deferred work** — only decisions that genuinely require the user's input.

At the end, separate:

- essential next work
- worthwhile polish
- next-iteration material

When the user asks to “keep agents busy,” redirect toward a bounded queue of valuable work and recommend a review cadence. A productive cadence is an audit after a meaningful feature batch, plus a lightweight backlog-pruning pass before starting another batch—not continuous autonomous task creation.

## File ownership and safe writes

`TASKS.md` is the actionable source of truth. `TASKS_DONE.md` is history. If `OPPORTUNITIES.md` does not exist, propose its creation and use the opportunity format above; do not create it silently during a read-only audit.

Only write files when the user has requested the corresponding mutation. Before writing:

- inspect `git status --short --branch`;
- preserve unrelated changes;
- show the intended task/opportunity changes in the response or explain them clearly;
- validate IDs, formatting, and scoping against `TASKS.md`;
- do not commit, push, open PRs, or invoke implementation agents unless separately requested.

After an authorized `TASKS.md` edit, run a focused structural check (for example, inspect the diff and verify every new entry has the required fields). Full application verification is not normally needed because this skill should not change application code.
