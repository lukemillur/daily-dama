# Backlog Stories

Product outcomes, technical enablers, security controls, and launch gates awaiting technical scoping. An item is `Ready for scoping` once its product decision is settled; `scope-tickets` turns it into one or more entries in `TASKS.md` or the non-automated `TASKS_BACKLOG.md`. Harness-specific workflows live under `.claude/skills/` for Claude Code and `.agents/skills/` for Codex.

## Stories

_S001–S022 came from the user's 2026-08-21 QA pass on T122–T131 (landing page and trick goals), compiled via the `qa-handoff` artifact and refined by `product-manager`. S001–S005 and S007–S022 were scoped in this pass into T132–T152 (see `TASKS.md`) and removed from this file per the usual promotion cleanup. S006 remains below._

_S032–S041 were refined from [BACKEND_ROADMAP.md](BACKEND_ROADMAP.md) on 2026-08-21 using the Codex `product-manager` workflow. S032–S039 and S041 were scoped into umbrellas T153–T162 and removed from this file; T153 was later activated in [TASKS.md](TASKS.md), while T154–T162 remain in [TASKS_BACKLOG.md](TASKS_BACKLOG.md). S040 remains proposed because mobile hardening is explicitly deferred by [AGENTS.md](AGENTS.md)._

### [S006] Make the footer bar follow the user's rainbow theme preset

- **As a:** user with a rainbow theme preset selected
- **I want:** the footer bar's background to reflect that preset
- **So that:** the whole app feels consistent with my chosen theme, including the Profile screen where the footer will now live
- **Evidence:** QA comment on T126 — "ensure the footer bar responds to the user's selected rainbow theme preset."
- **Priority:** Medium
- **Status:** Ready for scoping
- **Acceptance criteria:** With a rainbow theme preset selected, the footer bar's background visibly reflects that preset rather than a fixed color, while remaining readable against its "Leave app" text.
- **Notes:** Concerns the same component as the now-scoped T136 (footer route-scoping, from S005). **Scoping-time finding (2026-08-21):** tracing the code shows this may already work — `AppFooterBar` (`src/components/app-tabs.web.tsx`) reads its background from `theme.buttonBackground`, where `theme = useResolvedTheme()`; `useResolvedTheme` calls `resolveTheme(useUserProfile())`, and `resolveTheme` derives `background`/`buttonBackground` from `preferences.themeBackgroundColor`/`themeAccentColor` — the same profile fields a rainbow preset sets via `setThemeColors(preset.backgroundColor, preset.accentColor)` in `kentei-onboarding.tsx`. No code path found where a selected preset wouldn't reach the footer's background. Held back from this scoping run rather than promoted to a duplicate ticket — needs a decision: confirm in the running app whether this is in fact already working (in which case this story can be rejected/closed), or describe more specifically what was actually observed not updating (e.g. a specific preset, a specific screen, a stale render) so scoping can target the real gap.

### [S040] Harden account behavior on iOS and Android

- **Type:** User outcome
- **Beneficiary:** Mobile practitioners
- **Outcome:** The same account, callback, secure credential storage, offline sync, conflicts, logout, and deletion behavior works across web, iOS, and Android.
- **Evidence:** `BACKEND_ROADMAP.md` Phase 5.
- **Priority:** Medium
- **Status:** Proposed
- **Acceptance criteria:** Independent platform verification covers native PKCE callbacks, SecureStore-backed Auth storage, Auth email links, offline mutation and reconnection, account isolation, and active-Sesh safety on both iOS and Android.
- **Notes:** Deliberately deferred. `AGENTS.md` makes web the only active target until the user explicitly resumes mobile hardening; do not scope or implement this item under the current agreement.
