---
name: product-manager
description: Audit the Daily Dama product and repository, identify evidence-based product opportunities, prioritize them against the current product direction, and turn selected opportunities into user stories in BACKLOG_STORIES.md. Use when the user asks to populate, refine, prioritize, prune, or review the Daily Dama backlog, or asks what valuable work should happen next. Does not write TASKS.md — see the scope-tickets skill for that.
---

# Daily Dama Product Manager

Maintain a healthy supply of valuable, buildable Daily Dama product thinking without generating backlog noise. This skill is a product-thinking workflow; it does not implement application code, does not perform technical scoping, and does not run the `newTicket` implementation workflow.

This skill stops at the user story. Turning a `Ready for scoping` story into a `TASKS.md` entry is a separate concern that requires reading the codebase — that is the `scope-tickets` skill's job, not this one. Keeping the split means product value gets judged before anyone starts reasoning about implementation, and this skill never has to know what `TASKS.md`'s scoping rules currently look like.

## Operating modes

Infer the mode from the request. If it is ambiguous, perform a read-only audit and ask what should be promoted.

- **Audit**: inspect the product context, current backlog, recent work, routes, tests, and obvious UX friction. Report evidence, opportunities, risks, and the recommended next bet. Do not edit `BACKLOG_STORIES.md` or `TASKS.md`.
- **Propose**: generate a small set of new opportunities, normally three to five. Record them in `OPPORTUNITIES.md` only if that file already exists or the user explicitly asks to maintain the opportunity log. Do not create user stories yet.
- **Refine**: turn a named opportunity into one or more user stories in `BACKLOG_STORIES.md`, each with acceptance criteria stated in product/user terms and a `Status` of `Proposed` or, once you and the user agree it's ready, `Ready for scoping`. Do not describe implementation, files, or technical mechanism.
- **Prioritize**: rank existing stories in `BACKLOG_STORIES.md` (and, read-only, existing `TASKS.md` work) against the current product objective. Explain meaningful reorderings; do not rewrite history in `TASKS_DONE.md`.
- **Prune**: identify stale, duplicated, over-scoped, or directionally weak stories or opportunities. Recommend removal, merging, downgrading, or deferral. Delete or rewrite entries only when explicitly authorized.

When one or more stories reach `Ready for scoping`, tell the user and suggest invoking `scope-tickets` next — do not invoke it yourself.

## Context gathering

Read these sources before making product recommendations, in this order:

1. `AGENTS.md`, including the Daily Dama handoff embedded in it.
2. `BACKLOG_STORIES.md`, if it exists, so proposals don't duplicate stories already in flight.
3. `TASKS.md` and `TASKS_DONE.md`, read-only, for a sense of what's already built or already queued — not to reason about how new work would be scoped.
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

## User story shaping

A story is not a ticket. Keep it in product and user-behavior language; leave area, files, mechanism, and effort out — that judgment belongs to `scope-tickets`, which has the codebase context this skill deliberately doesn't gather.

- One story = one coherent user outcome. If it needs "and" to describe the outcome, it's probably two stories.
- Acceptance criteria describe what the user can now do or perceive, not how it's built.
- `Status` starts at `Proposed`. Move it to `Ready for scoping` only once you and the user agree the product decision is settled — no open question that would change what gets built.
- Respect the repository's web-only active scope: don't write a story whose only fulfillment is native work, unless the user has explicitly resumed mobile hardening.
- Do not assign task IDs (`T###`) or reference `TASKS.md` formatting — that happens downstream.

Use this format when drafting a story:

```md
### [S###] <short title>

- **As a:** <persona — maker, new learner, existing practitioner>
- **I want:** <capability>
- **So that:** <outcome>
- **Evidence:** <specific repository or user evidence>
- **Priority:** High / Medium / Low
- **Status:** Proposed / Ready for scoping / Scoped → T### / Rejected
- **Acceptance criteria:** <observable, testable by a user — not a mechanism>
- **Notes:** <deferred scope, open product questions>
```

Before adding a story, check `BACKLOG_STORIES.md` for duplicates or an existing story covering the same outcome. Never overwrite unrelated entries or flip another story's status without cause.

## Review output

Keep reports decision-oriented. A normal audit should contain:

1. **Iteration objective** — the current objective, or the smallest assumption if none is documented.
2. **Evidence** — three to seven concrete observations with file or task references.
3. **Opportunities** — the most important candidate problems, not a feature dump.
4. **Recommendation** — the next one to three bets, with value, confidence, learning value, and effort.
5. **Proposed story(-ies)** — only when requested or clearly authorized.
6. **Questions / deferred work** — only decisions that genuinely require the user's input.

At the end, separate:

- essential next work
- worthwhile polish
- next-iteration material

When the user asks to “keep agents busy,” redirect toward a bounded queue of valuable work and recommend a review cadence. A productive cadence is an audit after a meaningful feature batch, plus a lightweight backlog-pruning pass before starting another batch—not continuous autonomous task creation.

## File ownership and safe writes

`BACKLOG_STORIES.md` is this skill's file to own; create it with the story format above if it does not yet exist and the user is authorizing a story write. `TASKS.md` and `TASKS_DONE.md` are read-only from this skill — never edit them here, even when a story is marked `Ready for scoping`; that write belongs to `scope-tickets`. If `OPPORTUNITIES.md` does not exist, propose its creation and use the opportunity format above; do not create it silently during a read-only audit.

Only write files when the user has requested the corresponding mutation. Before writing:

- inspect `git status --short --branch`;
- preserve unrelated changes;
- show the intended story/opportunity changes in the response or explain them clearly;
- validate story IDs and formatting against existing entries in `BACKLOG_STORIES.md`;
- do not commit, push, open PRs, or invoke implementation agents unless separately requested.

After an authorized `BACKLOG_STORIES.md` edit, run a focused structural check (inspect the diff and verify every new or updated entry has the required fields). Full application verification is never needed because this skill never changes application code or `TASKS.md`.
