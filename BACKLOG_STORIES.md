# Backlog Stories

Product outcomes, technical enablers, security controls, and launch gates awaiting technical scoping. An item is `Ready for scoping` once its product decision is settled; `scope-tickets` turns it into one or more entries in `TASKS.md` or the non-automated `TASKS_BACKLOG.md`. Harness-specific workflows live under `.claude/skills/` for Claude Code and `.agents/skills/` for Codex.

## Stories

_S001–S022 came from the user's 2026-08-21 QA pass on T122–T131 (landing page and trick goals), compiled via the `qa-handoff` artifact and refined by `product-manager`. S001–S005 and S007–S022 were scoped in this pass into T132–T152 (see `TASKS.md`) and removed from this file per the usual promotion cleanup. S006 remains below._

_S032–S041 were refined from [BACKEND_ROADMAP.md](BACKEND_ROADMAP.md) on 2026-08-21 using the Codex `product-manager` workflow. S032–S039 and S041 were scoped into umbrellas T153–T162 and removed from this file; T153 was later activated in [TASKS.md](TASKS.md), while T154–T162 remain in [TASKS_BACKLOG.md](TASKS_BACKLOG.md). S040 remains proposed because mobile hardening is explicitly deferred by [AGENTS.md](AGENTS.md)._

_S042–S062 came from the user's 2026-08-25 QA pass on the Full-Batch of PR #158–223 (three items were follow-up gaps on already-`Done` tickets T144/T146/T153.12; the rest were general feedback, mostly Auth/Account UI). 19 were scoped into T163–T181 (see `TASKS.md`) and removed from this file. S051 remains below — scoping found its acceptance criteria already implemented. S057 also remains below — its acceptance criteria conflicts with a deliberate anti-enumeration design decision already in the code and needs the user's explicit call before it can be scoped either way._

### [S006] Make the footer bar follow the user's rainbow theme preset

- **As a:** user with a rainbow theme preset selected
- **I want:** the footer bar's background to reflect that preset
- **So that:** the whole app feels consistent with my chosen theme, including the Profile screen where the footer will now live
- **Evidence:** QA comment on T126 — "ensure the footer bar responds to the user's selected rainbow theme preset."
- **Priority:** Medium
- **Status:** Ready for scoping
- **Acceptance criteria:** With a rainbow theme preset selected, the footer bar's background visibly reflects that preset rather than a fixed color, while remaining readable against its "Leave app" text.
- **Notes:** Concerns the same component as the now-scoped T136 (footer route-scoping, from S005). **Scoping-time finding (2026-08-21):** tracing the code shows this may already work — `AppFooterBar` (`src/components/app-tabs.web.tsx`) reads its background from `theme.buttonBackground`, where `theme = useResolvedTheme()`; `useResolvedTheme` calls `resolveTheme(useUserProfile())`, and `resolveTheme` derives `background`/`buttonBackground` from `preferences.themeBackgroundColor`/`themeAccentColor` — the same profile fields a rainbow preset sets via `setThemeColors(preset.backgroundColor, preset.accentColor)` in `kentei-onboarding.tsx`. No code path found where a selected preset wouldn't reach the footer's background. Held back from this scoping run rather than promoted to a duplicate ticket — needs a decision: confirm in the running app whether this is in fact already working (in which case this story can be rejected/closed), or describe more specifically what was actually observed not updating (e.g. a specific preset, a specific screen, a stale render) so scoping can target the real gap.

### [S051] Validate email format at signup with clear feedback

- **As a:** user signing up
- **I want:** to be told immediately if my email address is malformed
- **So that:** I don't submit a broken address and get a confusing failure later
- **Evidence:** General feedback — "Add email validation regex and user facing feedback to the email signup input."
- **Priority:** Medium
- **Status:** Ready for scoping
- **Acceptance criteria:** Entering a malformed email address at signup shows a clear, specific validation message before (or immediately upon) submission, distinct from server-side signup errors; a well-formed address shows no such message.
- **Notes:** **Scoping-time finding (2026-08-25):** already implemented. `sign-up-screen.tsx`'s `handleSubmit` calls `validateSignUpFields` (`signup-validation.ts`), which runs `getEmailValidationError` (`email-validation.ts`, regex `^\S+@\S+\.\S+$`) and surfaces `errors.email` as an `ErrorText` under the email field before any network call. Not scoped as a duplicate fix — held here per the same pattern as S006 in case the user observed a specific case this doesn't cover (e.g. a particular malformed address that passes today), which would need to be described concretely rather than re-scoped generically.

### [S057] Enforce email uniqueness at signup with a clear message

- **As a:** user signing up with an email that already has an account
- **I want:** to be told an account already exists
- **So that:** I don't create a duplicate/confused account or wonder why my signup silently failed
- **Evidence:** General feedback — "Enforce email uniqueness. If an account exists for a given email at signup ensure the user is made aware accordingly."
- **Priority:** High
- **Status:** Ready for scoping
- **Acceptance criteria:** Attempting to sign up with an email that already has an account shows a clear message that an account already exists for that email, without revealing whether the existing account's password guess would be correct.
- **Notes:** **Scoping-time finding (2026-08-25): this is a deliberate security tradeoff, not a gap — sent back rather than scoped.** `sign-up-screen.tsx`'s `handleSubmit` explicitly routes `error === null` and `categorizeAuthError(error) === 'accountAlreadyExists'` through the *identical* success path (same event, same navigation to `/auth/check-email`, same rendered outcome) — the inline comment says this is intentional: "A duplicate account must take the identical path as a true success — otherwise the distinct branch itself becomes the enumeration oracle that categorizeAuthError's dedicated accountAlreadyExists category exists to avoid." This story's acceptance criteria directly contradicts that design (it asks for a distinguishable "account already exists" message, which is exactly what an enumeration oracle looks like). Not scoped: this needs the user's explicit product call — keep the current anti-enumeration behavior (reject this story), or accept the enumeration tradeoff and have scoping change the signup call site's branch (a real, if small, security-posture change, not free).

### [S040] Harden account behavior on iOS and Android

- **Type:** User outcome
- **Beneficiary:** Mobile practitioners
- **Outcome:** The same account, callback, secure credential storage, offline sync, conflicts, logout, and deletion behavior works across web, iOS, and Android.
- **Evidence:** `BACKEND_ROADMAP.md` Phase 5.
- **Priority:** Medium
- **Status:** Proposed
- **Acceptance criteria:** Independent platform verification covers native PKCE callbacks, SecureStore-backed Auth storage, Auth email links, offline mutation and reconnection, account isolation, and active-Sesh safety on both iOS and Android.
- **Notes:** Deliberately deferred. `AGENTS.md` makes web the only active target until the user explicitly resumes mobile hardening; do not scope or implement this item under the current agreement.
