# Tasks — Collaborative execution

Tickets requiring owner decisions, dashboard actions, or external verification. Work through one named ticket with `$guided-ticket T230` (or resume with `$guided-ticket resume T230`). The skill is in [`.agents/skills/guided-ticket/SKILL.md`](.agents/skills/guided-ticket/SKILL.md).

`new-ticket` reads `TASKS.md` only. Never copy a ticket into that queue to make its claim script work. `TASKS_BACKLOG.md` remains the separate deferred queue. IDs are unique across all three queues and `TASKS_DONE.md`.

## Working agreement

- **Execution: External gate** means the agent completes authorized preparation and implementation, then guides the owner through remaining access, deployment, or verification steps.
- **Execution: Owner-in-loop** means the agent also presents recommendations at the ticket's named decision points before performing work that depends on those choices. Routine preparation proceeds without repeated approval.
- **Owner gates** names the required decisions/actions. **Automation boundary** says what the agent can complete independently. Neither field grants new production or Git authority.
- Keep `Status` compatible with `TASKS.md`: `Not started`, `In progress`, `Blocked` (reason required), `Done`. Use a separate **Checkpoint**: `Preparing`, `Implementing`, `Awaiting owner action`, `Awaiting external verification`, `Verifying`, `Ready to complete`, or `Complete`. Expected owner waits remain `In progress`; access failures or unsatisfied dependencies can be `Blocked` with the exact reason.
- Before starting, inspect task status, relevant local worktrees, and remote claims/PRs. This queue has no distributed claim mechanism; the owner coordinates concurrent sessions. Never take over an existing claim or infer abandonment from age.
- Keep a resumable execution guide at `outputs/guided-tickets/<ID>.md`. Record the checkout/branch/commit, target environment, decisions, completed steps, next owner action, and evidence. Keep secrets, full callback URLs, raw user data, and credentials out of the guide.
- Every collaborative ticket must begin on a focused checked-out branch named `task/<ID>-<short-ticket-slug>` (or an equivalent focused worktree with that branch). Create and check out the branch before changing the tracker, execution guide, source, tests, or configuration. If the current checkout is dirty with unrelated work, preserve it and use a separate worktree. Recheck local/remote branch collisions immediately before creation; an existing branch or ambiguous ownership is a coordination gate. Work in focused local checkpoints. Collaborative deployment tickets can require preparation commits before hosted verification and a final evidence/closure commit afterward. Follow `AGENTS.md` for Git authority; this queue does not inherit the automatic claim/push/merge exception for `TASKS.md`.
- **Preparation PR exception (owner approved 2026-09-04):** A preparation PR may open once all applicable local checks pass, with hosted criteria explicitly listed as pending and the ticket still open. Its merge requires the normal CI checks and existing owner authorization. This permits getting the implementation deployed for verification; it does not permit claiming hosted success early or grant automatic push, merge or production-deployment authority.
- Completion requires the ticket's actual exit criteria. Mark each criterion passed, failed, blocked, or not run with its source and environment. A guide written, local tests passed, or owner saying "saved" is not proof that a deployed flow works. Accept specific owner-observed evidence when the agent cannot observe it, labeling its source accurately.
- Once all criteria pass, move the entry to `TASKS_DONE.md` as `Done`, retaining the guide/evidence link. Do not close other tickets or proceed to another ticket automatically. If delivery or deployment is part of the criteria, it must finish before closure; otherwise report local completion and any pending Git delivery distinctly.

### [T294] Design native-feeling options for the Tricks screen

- **Area:** Tricks / UX design
- **Priority:** Medium
- **Status:** Not started
- **Execution:** Owner-in-loop
- **Checkpoint:** Preparing
- **Description:** The Tricks screen reads as a web page on iOS. Produce two or three design directions for a native-feeling Tricks screen (for example grouped rank sections, header search, swipe or context actions for notes and goals, a per-trick detail screen), with mockups, for the owner to choose from.
- **Owner gates:** The owner picks one direction (or a combination) before any build ticket is written.
- **Automation boundary:** The agent researches, mocks up and recommends; it does not change app code. After the owner's pick, it scopes the build into `TASKS.md` entries.
- **Exit criteria:** Two or three directions with mockups and tradeoffs are recorded in the execution guide; the owner's choice is recorded; the chosen direction is scoped into mechanically verifiable `TASKS.md` tickets.
- **Notes:** Owner request 2026-11-04. Respect the custom-trick and rank invariants in AGENTS.md. Web layout stays out of scope unless the owner chooses otherwise.

### [T295] Plan email/password accounts on iOS and Android

- **Area:** Auth / native
- **Priority:** High
- **Status:** Not started
- **Execution:** Owner-in-loop
- **Checkpoint:** Preparing
- **Description:** Replace the native "sign up, sign in and backup are not available here yet" state with working email/password accounts. This ticket produces the architecture plan for S040, limited to email and password, and splits the build into child tickets after owner approval.
- **Owner gates:** The owner approves the auth architecture plan (native Supabase client, SecureStore session storage, email-link callbacks into the app, identity switching, guest import and sync on native) before any implementation ticket is written.
- **Automation boundary:** The agent writes the plan and child-ticket drafts; it does not implement auth or change Supabase or production configuration.
- **Exit criteria:** An approved plan is recorded in the execution guide; S040 in BACKLOG_STORIES.md is updated to match; child tickets in `TASKS.md` cover the native auth client and storage, the email confirmation callback, sign-up and sign-in screens, a Sign in action on the T292 start screen that skips onboarding for existing accounts, native feedback submission (replacing T287's unavailable state, which exists only because native has no Supabase client), and backup/sync verification, each with mechanical exit criteria.
- **Notes:** Owner request 2026-11-09: native feedback must work once the native Supabase client exists. Decide in the plan whether guests can send feedback before signing in. Owner decisions 2026-11-04: email and password only for now (no Apple or Google sign-in); an existing web account signing in on mobile must not redo onboarding. Follow AGENTS.md durability and fail-closed rules for identity-changing workflows.
