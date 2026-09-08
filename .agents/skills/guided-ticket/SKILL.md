---
name: guided-ticket
description: Work through one Daily Dama ticket in TASKS_COLLABORATIVE.md with the owner, completing local preparation and implementation and providing a resumable step-by-step guide for dashboard configuration, deployment, decisions, and hosted verification. Use for starting or resuming collaborative tickets; autonomous TASKS.md execution belongs to new-ticket.
---

# Guided ticket

Execute one collaborative ticket through its stated exit criteria. Keep the owner involved at the named gates, do available preparation before asking for input, and persist enough context to resume after a dashboard action or a later conversation.

## Resolve and prepare

1. Locate the Daily Dama repository from the working directory and read `AGENTS.md`, `TASKS_COLLABORATIVE.md`, the named ticket, and its relevant handoffs. Interpret `$guided-ticket T230`, `$guided-ticket resume T230`, or an equivalent natural-language request. With no ID, select the first eligible `Not started` ticket by priority then file order; report the selection and handle only that ticket. Do not silently substitute a different ticket for a named one. If only interrupted tickets remain, identify them and ask which to resume.
2. Check the ticket against `TASKS.md`, `TASKS_BACKLOG.md` and `TASKS_DONE.md`. Satisfy explicit completion dependencies before implementation. Distinguish those from documented stage prerequisites (for example, another ticket's prepared deployment commit); never require a deployed test to pass before deploying the code it tests. Inspect existing evidence before declaring a prerequisite absent.
3. Inspect Git status, branch/commit, local worktrees, and relevant remote claim/PR state. Preserve unrelated changes. A remote `task/<ID>-*` claim, another session's execution record, or ambiguous ownership is a coordination gate: prepare a read-only handoff, do not take over. Unavailable remote state is not proof that no claim exists. Do not call `ticket-claim.mjs`, add the ticket to `TASKS.md`, or modify an automated claim branch to start guided work.
4. On resume, read `outputs/guided-tickets/<ID>.md` before doing work. Recheck the recorded checkout, deployment/project, current configuration and applicable evidence; retain decisions still valid for the same scope. Do not replay external writes merely because a previous action's response was lost. Verify its effect read-only first.
5. Before changing any tracker, execution guide, source file, test, configuration, or other repository content, create and check out a focused branch for the ticket. Use the project convention `task/<ID>-<short-ticket-slug>` (for example, `task/T227-dynamic-web-route-rewrites`) from the inspected base branch, or use an equivalent focused worktree whose checked-out branch has that name. If the current checkout has unrelated dirty work, preserve it and create the branch in a separate worktree; never switch away from or incorporate unrelated changes. Recheck local/remote branch collisions immediately before creation; an existing branch or ambiguous ownership is a coordination gate. Record the branch and worktree path in the guide. Only after the branch is checked out, set `Status: In progress` and `Checkpoint: Preparing`, record any existing authorization, and begin the guide or implementation edits. The guide is the execution record, not a distributed lock.

## Plan and execute

Create or update `outputs/guided-tickets/<ID>.md` using [assets/execution-guide.md](assets/execution-guide.md). Populate it from inspected facts; remove irrelevant sections and replace all template placeholders. Keep substantive planning here rather than creating a second plan with divergent state.

- `Planning: Required`: trace the affected boundary and write ordered implementation, verification, and owner-gate steps before changing it. Routine `Implementer` work needs only a short plan. Apply `AGENTS.md`'s approval rules for material architectural choices; the field itself does not require approval or a separate subagent.
- `Execution: External gate`: complete authorized local work and checks independently. Present the next external action only when its target, change and verification are concrete.
- `Execution: Owner-in-loop`: provide a recommendation with meaningful tradeoffs at each named decision. Ask only when the answer changes the work or authority required. Complete independent preparation while awaiting it; honor choices already made for the same target/scope without asking again.
- Keep changes within the ticket. If evidence disproves its premise, explain the finding and propose the smallest scope correction. Existing implementation can satisfy a task after the required verification; do not manufacture a code diff. A newly discovered unrelated defect gets a report, not an unapproved repair project.

## Guide the owner

Read current repository handoffs and check official service documentation or the observed dashboard when building instructions. Do not copy stale dashboard paths from memory. Mark unobserved UI labels or unknown values explicitly; when navigation differs, request a cropped, redacted screenshot of the relevant screen and adjust the guide.

For each owner step, provide:

1. **Where and target:** service/page, confirmed project and environment; link directly when verified.
2. **Action and reason:** exact field/value or safe command, why it is needed, and whether it reads, writes, deploys, sends email, or deletes a specified disposable fixture.
3. **Expected result:** what the owner should see after that step.
4. **Evidence to return:** minimal redacted result sufficient to decide the next step. Do not ask for passwords, service-role keys, access tokens, full verification URLs, or session data.
5. **If different:** a concrete stop/diagnosis action and a scoped recovery instruction when the change warrants one. Record known previous settings before reversible configuration changes; never promise rollback compatibility without evidence.

Show the short overall sequence, then walk through one decision or coherent group of safe steps at a time. Keep later conditional steps visible as pending, not instructions to execute now. Ask a concise question in chat for the current action and pause only when further progress depends on the answer. A static guide alone does not complete the ticket.

Owner actions may be performed through an available API/browser if the user has already authorized the exact action and target. Access is not authorization. For deployment, costs, infrastructure choices, destructive changes or Git publication, follow the current request and `AGENTS.md`; this skill grants no additional authority. When a new authorization is necessary, first finish the reviewable preparation and explain the specific action awaiting it. Do not add blanket confirmation gates for routine local work.

Never direct the owner to paste secrets into the conversation or tracked guide. Use dashboard secret fields or the documented local secret mechanism. Redact outputs before recording them. A public DSN or publishable key is not the same as a private auth/service-role token; still avoid retaining unnecessary configuration values.

## Checkpoint and resume

Use the queue's `Checkpoint` vocabulary, keeping `Status` compatible with the existing tracker:

| Situation | Status | Checkpoint |
| --- | --- | --- |
| Inspection/plan | In progress | Preparing |
| Local change | In progress | Implementing |
| Decision/dashboard action needed | In progress | Awaiting owner action |
| Delivery/hosted evidence pending | In progress | Awaiting external verification |
| Checks running | In progress | Verifying |
| Required access/dependency unavailable or check failed | Blocked | Last applicable checkpoint; explain reason in Notes |
| All exit criteria passed, closure pending | In progress | Ready to complete |
| Archived with evidence | Done | Complete |

Before every pause, persist the target/build, completed steps and evidence, remaining criteria, accepted decisions/authorization, and the exact next action. If ownership is ambiguous or the checkout is not writable, provide that checkpoint in chat without modifying another session's tracker or guide. Otherwise link the guide in chat and give `$guided-ticket resume <ID>`. On an ordinary follow-up in the same conversation, continue the current ticket without requiring the owner to repeat that command. Expected waiting is not failure; unavailable credentials or a failed check must not be disguised as a successful owner step.

## Verify and finish

Apply the repository's risk-based verification tiers and relevant backend/security handoffs. When using a repository script, inspect its current interface rather than borrowing flags from another workflow. Use the available bundled runtime when the system runtime is broken.

Record each exit criterion as `passed`, `failed`, `blocked`, or `not run`, with commit/build, environment, timestamp, and evidence source. Distinguish agent observations, owner observations, and local tests. Specific owner-observed results can satisfy a manual criterion; a generic "done" confirms an action only. Follow with the relevant behavior check. Local Mailpit, mocks, static exports, or unit tests do not establish hosted email, permissions, headers or event delivery. Reuse valid evidence and rerun only checks affected by subsequent code/configuration changes.

If any required criterion remains unpassed, leave the ticket open with the exact gap. If a deployment is part of its criteria, prepared code or a PR is an intermediate milestone; do not archive before deployed verification. The owner-approved preparation-PR exception in `TASKS_COLLABORATIVE.md` permits opening a preparation PR after all applicable local checks pass while hosted criteria remain explicitly pending. Its description must identify the verified preparation commit, local results, pending hosted criteria and next deployment/owner step; leave the tracker entry open. Required CI and the existing Git authorization rules still govern merge and deployment. Never close the ticket or relax a local check to make a preparation PR possible.

When all criteria pass, retain the guide with a concise evidence/decision summary, set `Checkpoint: Complete`, and move this ticket to `TASKS_DONE.md` with `Status: Done` and an evidence link in the focused closure commit. Preserve the guide for future operations; do not delete it like a temporary implementation plan. Follow existing authorization for any push, PR or merge and report pending Git delivery separately. Never inherit `new-ticket`'s automatic publishing permissions solely because this ticket has a T-number. Close only this ticket and stop; another ticket requires a new user request.
