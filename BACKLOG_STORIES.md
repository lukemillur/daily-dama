# Backlog Stories

User stories awaiting technical scoping. A story is `Ready for scoping` once its product decision is settled; `scope-tickets` turns it into one or more `TASKS.md` entries and flips its status to `Scoped → T###`. See `.claude/skills/product-manager/SKILL.md` and `.claude/skills/scope-tickets/SKILL.md`.

### [S001] Visual color picker for theme colors

- **As a:** user customizing my app theme
- **I want:** to choose my background and accent colors from a real color picker (swatches/spectrum/sliders), not by typing hex codes
- **So that:** I can pick a color I actually want without knowing or looking up its hex value
- **Evidence:** `ThemeColorPicker` (`src/features/profile/components/theme-color-picker.tsx`) currently exposes only raw hex `TextInput` fields for background and accent color.
- **Priority:** Medium
- **Status:** Scoped → T086
- **Acceptance criteria:** From Profile, the user can select a background color and an accent color through a visual picker interface, see the result applied live or in a preview, and save it — without ever needing to type or know a hex code. Manual hex entry may remain as a secondary option for users who do have one.
- **Notes:** Library choice (existing free-license package vs. hand-built) and exact interaction pattern are implementation decisions for scoping, not product decisions here.

### [S002] Pre-configured rainbow theme presets

- **As a:** user who doesn't want to hand-pick colors
- **I want:** a set of ready-made, visually pleasing themes — one per rainbow color — that I can apply with one action
- **So that:** I can get a good-looking theme quickly, without using the color picker at all
- **Evidence:** Free-form-only theming was an explicit T083 decision ("not curated presets"); user is now asking to add presets as a distinct, separate path from the picker.
- **Priority:** Medium
- **Status:** Scoped → T087
- **Acceptance criteria:** The user can find and apply one of seven pre-configured themes (red, orange, yellow, green, blue, indigo, violet) from a component that is visibly and structurally separate from the free-form color picker (S001) — not a tab or mode switch within the same control. Applying a preset updates the app's background/accent (and, once S003 lands, text color) immediately and is saved like any other theme choice.
- **Notes:** Exact hex values per preset are a design/implementation call during scoping, not specified here. Depends on nothing blocking — can be scoped independently of S001 and S003.

### [S003] Reactive text color, contrast requirement removed

- **As a:** user customizing my app theme
- **I want:** the app to automatically adjust text color to stay legible against my chosen background/accent, or let me set my own text color, without being blocked by a contrast check
- **So that:** I can use the color I actually want instead of hunting for one that passes an opaque validation rule
- **Evidence:** `ThemeColorPicker`'s copy currently reads "Each must stay easy to read against the app's text color," backed by `meetsMinimumContrast` (WCAG AA 4.5:1) in `src/shared/color/contrast.ts`, checked only against the fixed `AppColors.ink` — user reports this made finding an accepted color impractically hard. Separately, none of the app's title/label-style text is theme-reactive today: `Eyebrow` is hardcoded to `AppColors.red`, `DisplayTitle` to `AppColors.ink` (`src/components/ui/typography.tsx`), and screens like `daily-home.tsx` layer on further fixed-color text (`SectionTitle`, `NextTrickName`, `NextTrickMeta`, etc.) — none flow through `AppThemeProvider`. T083.3's own notes already flagged this as an unresolved gap ("a fixed red eyebrow label sits on the accent surface... with no contrast guarantee").
- **Priority:** Medium
- **Status:** Scoped → T085.1, T085.2, T085.3
- **Acceptance criteria:** Choosing a background/accent color pair is never blocked by a contrast check. Text color reacts automatically to the user's chosen background and accent colors so it stays visually coherent by default — this applies to *all* themed text, including titles, eyebrows/labels, and section headers (e.g. "Pick up where you left off," "Next up in Kentei," rank labels), not just body copy. The user can also explicitly set a custom text color that overrides the automatic behavior, and that override applies across the same full set of text. Text color, background, and accent are all part of the same reactive theme system.
- **Notes:** **Accessibility trade-off, flagged not blocked:** this removes the only contrast guarantee the theming feature has (added deliberately in T083.2). The user has explicitly chosen full removal over a softer option (e.g., a non-blocking warning) — proceeding as asked. Scoping should decide the automatic-text-color algorithm (e.g., luminance-based light/dark text choice) since none exists today, and should inventory which typography primitives/one-off styled-text usages need to move onto it — broader than just `BodyText`.

### [S004] Restore horizontal margin on the Trick Goals trick-directory picker

- **As a:** user picking a trick from the all-trick Goals flow
- **I want:** the trick list to have the same horizontal breathing room as the "Search Tricks" box above it
- **So that:** the picker doesn't look like it's rendering edge-to-edge/broken compared to the rest of the screen
- **Evidence:** T082 (marked Done) padded row *text* (`identityLayout`, `padding: 15px 22px` on `IdentityContainer`/`SelectableIdentity` in `src/features/tricks/components/trick-directory.tsx`), but each row's colored background band (`TrickRowContainer`) still spans full width with no margin. `DirectorySearch` sits inset by `DirectoryHeader`'s `22px 22px` padding, so it visibly has margin the row bands don't — confirmed by reading current source, not just the user's report.
- **Priority:** Medium
- **Status:** Scoped → T088
- **Acceptance criteria:** On the all-trick Trick Goals screen, empty space is visible on both sides of the trick list (row background bands, not just their text) matching the horizontal inset of the "Search Tricks" input above it, checked in-browser at the standard web viewport.
- **Notes:** This corrects T082, which is why it's re-opened as a new story rather than editing T082's archived (Done) entry — history isn't rewritten per `TASKS_DONE.md` convention. No open product question; this is a defect, ready for scoping as-is.
