# Tasks — Formal Backlog (excluded from automation)

Scoped, well-defined tasks that live outside the active work queue in [TASKS.md](TASKS.md). Entries here follow the same template and status legend as `TASKS.md`, and are just as ready to pick up — the only difference is intent: this file is **not** read by the `newTicket` workflow (see `.claude/skills/newTicket/SKILL.md`), so nothing here is claimed, planned, or implemented automatically.

To bring a task back into automated flow, move its entry from this file into `TASKS.md`'s `Backlog` section (reversing the process that put it here). Do not have an agent do this as a side effect of an unrelated task — moving something into the automated queue is a deliberate human decision.

Completed entries still move to [TASKS_DONE.md](TASKS_DONE.md), same as `TASKS.md`, if a task here is ever completed manually.

Tickets selected for owner participation or external verification live separately in [TASKS_COLLABORATIVE.md](TASKS_COLLABORATIVE.md) and use `$guided-ticket`. This file retains deferred work. Allocate IDs across both of these queues, `TASKS.md`, and `TASKS_DONE.md`.

---

_T042, T043/T043.1–T043.2 and T044/T044.1–T044.2 moved to [TASKS.md](TASKS.md) on 2026-10-29 at the owner's explicit request to activate the iOS audit findings. IDs are preserved; current acceptance targets iOS Simulator. Original Android and physical-device checks have not been verified._

---

_T153–T162 came from S032–S039 and S041, refined from a pre-decision backend analysis (since removed; Supabase was selected and is now live in production) and initially scoped into this formal backlog on 2026-08-21. Every currently actionable backend-roadmap workstream has now moved phase by phase into the automated queue in [TASKS.md](TASKS.md), where T154 is ordered as the Phase 1/Phase 4 shared prerequisite for T158. No T153–T162 ticket remains in this file. S040 (native account hardening) remains `Proposed` in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) pending a product decision on native account support._

_Phase 5 consideration: no ticket is added here or to [TASKS.md](TASKS.md). S040 remains `Proposed`, and its native PKCE, SecureStore, and iOS/Android verification scope needs a product decision before it is scoped._
