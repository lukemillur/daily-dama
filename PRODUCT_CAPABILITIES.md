# Daily Dama: Current Product Capabilities

This document describes what Daily Dama currently exposes to a user. It is a product baseline for future agents and product decisions.

The exhaustive inventory is intentionally more detailed than the condensed feature set. It includes meaningful user-visible states and workflows, but excludes implementation details that do not change the user experience. It is based on repository inspection and does not itself constitute runtime verification.

## Exhaustive capability inventory

### Application access and navigation

- Enter a password to unlock the application when the access gate is enabled.
- Receive an error after an incorrect password attempt and try again.
- Navigate between Home, Sesh, Tricks, Stats, and Profile after onboarding.
- Retain user data locally between visits.

### Initial onboarding and skill placement

- Begin a guided Kentei placement flow.
- Choose a self-described starting level: Basic, Advanced, Expert, or Master.
- Answer whether the user can land each presented trick.
- See each assessment trick's name, rank, level, class, and position in the assessment.
- Receive an assessed Kentei rank.
- See an animated rank reveal.
- Choose one or more tricks from the assessed rank as an initial practice list.
- Select or deselect tricks before completing onboarding.
- Choose an initial theme from Red, Orange, Yellow, Green, Blue, Indigo, or Violet presets.
- Skip theme selection and use the default appearance.
- Finish onboarding and proceed to Sesh.
- Seed initial laced state from tricks marked as landed during onboarding.

### Home

- View the current Kentei rank and current practice streak.
- Start a first Sesh when no practice history exists.
- See the most recently practiced trick, its duration, and its lace count.
- Practice the most recent trick again.
- Start another Sesh if a previously practiced trick is no longer available.
- See the next standard Kentei trick recommended for learning.
- Start practicing the recommended trick directly.
- See the current focused practice rotation.
- See whether rotation items are standard tricks, custom tricks, or custom sequences.
- Preview custom-sequence steps.
- Start direct practice for any rotation item.
- Open Tricks to edit the rotation.
- Choose tricks when the rotation is empty.
- See practice time for the last 24 hours, 7 days, 30 days, and 365 days.
- See seven-day Sesh count, practice time, and lace totals.
- Open Stats.

### Trick library and practice-list management

- Browse the standard Kentei trick library.
- Browse sections for focused tricks, each Kentei rank, and custom tricks.
- Search for tricks by name where a directory picker provides search.
- Add a trick to the focused practice list.
- Remove a trick from the focused practice list.
- See explicit selected/not-selected state.
- See whether a trick is laced.
- See accumulated lace counts.
- See note counts and goal counts.
- Open a trick's notes.
- Open a trick's goals.
- Start direct practice for an available trick.
- Edit custom tricks and sequences.
- Delete custom tricks and sequences through confirmation.
- Open aggregate Laced Tricks, Trick Goals, and All Notes views.

### Custom tricks and sequences

- Create a standalone custom trick.
- Name a custom trick.
- Assign an optional perceived Kentei rank from 1 through 12.
- Leave a custom trick unranked so it appears in the Custom section.
- Choose whether a new custom trick immediately joins the focused list.
- Edit a custom trick's name, rank, and focused-list membership.
- Delete a custom trick or keep it during deletion confirmation.
- Create a named custom sequence.
- Start a sequence with editable free-text movement steps.
- Add additional free-text steps.
- Search standard and standalone-custom tricks for sequence steps.
- Insert existing tricks as sequence steps.
- Mix existing-trick steps and free-text steps.
- Reorder steps upward or downward.
- Remove individual steps.
- See sequence steps in order during selection, practice, and completion.
- Add, edit, or delete custom sequences.
- Use stable custom-trick identities independent of editable names.
- Preserve captured sequence-step names when source tricks later change.

### Laced-trick management

- Open a complete Laced Tricks view organized by rank and Custom.
- Manually mark a trick laced or unlaced.
- See explicit Laced/Unlaced labels.
- Have a trick become laced automatically after recording a landing.
- Preserve laced status for tricks with practice history.

### Single-trick Sesh setup

- Start a Sesh from Sesh, Home, Tricks, a goal, a neglected-trick reminder, or a Stats challenge.
- Choose a focused trick.
- Practice a directly linked trick without first adding it to the focused list.
- Restore the previous Sesh format.
- Choose Timed practice.
- Set a whole-number duration from 1 to 60 minutes.
- Choose Open-ended practice.
- Set an optional target of 1 to 999 laces.
- Leave the open-ended target blank.
- See a timed personal best for the selected trick and duration.
- Choose to reveal personal-best results at the end or show progress live.
- Enter the multi-trick Sesh builder.
- See an empty state and navigate to Tricks when no focused tricks are available.

### Single-trick active Sesh

- See a three-second countdown before practice.
- See the selected trick and sequence steps.
- See remaining time for timed practice or elapsed time for open-ended practice.
- Record each successful landing with “Laced.”
- See current lace count.
- See a lace timeline with elapsed and between-lace intervals.
- Pause and resume a Sesh.
- End an untargeted Sesh manually.
- Have timed practice finish automatically at its deadline.
- See progress toward an optional lace target.
- End normally after reaching the target.
- End anyway before reaching the target.
- See up to two previous notes for the active trick.
- See how many older notes are hidden from the active view.
- Receive celebrations for a first-ever lace, a new personal best, or an achieved lace-count or practice-time goal.
- See live progress against a personal best when enabled.

### Sesh completion

- See the completed trick or sequence and its steps.
- See total practice time, total laces, average pace, and fastest lace.
- Review the complete lace timeline.
- See whether the result is a new best, a tie, or below the previous best.
- See first-lace and newly achieved-goal celebrations.
- See progress for all goals attached to the trick.
- Add a contextual post-Sesh note.
- Dismiss the post-Sesh note prompt.
- Repeat the same Sesh with the same trick and format.
- Start another Sesh.

### Multi-trick Seshes

- Select multiple standard, custom, and sequence tricks for a temporary run.
- Search the trick directory while selecting.
- Keep multi-trick selection separate from the persistent focused list.
- Require at least one selected trick before starting.
- Set optional time per trick from 1 to 60 minutes.
- Leave time per trick blank for manually advanced practice.
- Enable “Advance after one lace.”
- Return to selection or cancel before starting.
- Practice selected tricks sequentially.
- Record laces separately for each trick.
- Pause and resume.
- Advance manually or automatically after the first lace.
- Move to the next trick.
- See a completion acknowledgment between tricks.
- End or cancel the overall run.
- Review each trick's time and lace count in the final wrap-up.

### Kentei assessments after onboarding

- Start a practice-based Kentei assessment from Profile.
- Run a full bottom-to-top assessment.
- Start from a selected rank and assess that rank upward.
- Assess only the current rank.
- See current rank standing and an attempts reminder.
- Skip countdowns between assessment tricks.
- Record assessment landings as practice history.
- Advance after the first lace.
- Preview and confirm skipping the remainder of a rank.
- Cancel a pending rank skip.
- Cancel or end an assessment early.
- See an assessment result and skipped-trick wrap-up.
- See a warning when unresolved lower ranks create a progression gap.
- Return to Home after completion.
- Receive automatic rank promotion after completing qualifying requirements.

### Goals

- Set a lace-count goal for a trick.
- Set a practice-time goal for a trick.
- Add multiple goals to a trick.
- See current progress and achieved state.
- Practice directly from a goal.
- Delete a goal through confirmation.
- Review goals grouped by trick in the aggregate view.
- Add a goal from the aggregate view by selecting a trick.

### Notes

- Add notes to a trick.
- Add a note from a completed Sesh.
- See previous notes during practice.
- Edit notes.
- Delete notes through confirmation.
- Browse all notes across tricks.
- See associated trick names and added/edited dates.
- See notes ordered by recent activity.

### Stats and practice history

- See an empty Stats state and start a Sesh from it.
- View total laces, total practice time, and Sesh count.
- See focused tricks that have been neglected.
- Start direct practice for a neglected trick.
- View totals grouped by trick.
- See each trick's lace total, practice time, Sesh count, and most recent practice date.
- Open detailed history for an individual trick.
- Review past Sesh dates, durations, and lace counts.
- See personal bests grouped by timed duration.
- Launch a preconfigured challenge from a personal best.
- Preserve historical trick-name snapshots when custom tricks are renamed or deleted.

### Streaks

- See the current practice streak on Home.
- Set the daily practice threshold that keeps a streak alive.
- Choose a whole-number threshold from 1 to 60 minutes.
- Receive validation for invalid thresholds.

### Profile and personalization

- View assessed Kentei rank and focused-trick count.
- Start another Kentei assessment.
- Select a preset theme.
- Customize background, accent, and text colors.
- Choose colors with visual spectrum controls.
- Enter six-digit hexadecimal colors directly.
- See color swatches and contrast guidance.
- Save each color independently.
- Reset background and accent colors.
- Reset text color.
- Send feedback through an email link.

### Developer-only surfaces

Development builds expose a procedural trick-visualization sandbox and a Sesh-sequence sandbox. These are not normal user-facing product features and should not be used as evidence of the primary product promise.

## Condensed primary feature set

### Onboarding and progression

- Complete a guided skill assessment.
- Receive an assessed starting rank.
- Choose initial tricks to practice.
- Choose an optional visual theme.

### Home

- View current rank and practice streak.
- Resume the most recently practiced trick.
- See the next recommended trick.
- View and access the current practice rotation.
- Review recent practice time, Sesh count, and lace totals.

### Trick library

- Browse and search the trick library.
- Build a personal practice list.
- Practice any trick directly.
- Track laced tricks.
- Create, edit, and delete custom tricks and sequences.

### Sesh practice

- Start timed or open-ended practice.
- Set an optional lace target.
- Record laces and track time.
- Pause, resume, or end a Sesh.
- Compare performance against personal bests.
- Review a completion summary and repeat the Sesh.

### Multi-trick practice

- Build a temporary multi-trick run.
- Practice tricks sequentially.
- Set time per trick or advance manually.

### Assessments

- Run full, partial, or current-rank assessments.
- Skip ranks during multi-rank assessments.
- Receive automatic rank promotion when requirements are met.

### Goals and notes

- Set lace-count or practice-time goals.
- Track progress and achievements.
- Write, review, edit, and delete trick notes.

### Stats and history

- Review overall and per-trick practice statistics.
- Identify neglected tricks.
- Review detailed trick history and timed personal bests.

### Profile and personalization

- Re-run an assessment.
- Customize themes and colors.
- Configure streak requirements.
- Send feedback.

## Player-facing pitch

Kendama players don’t need another trick list. They need a better way to practice.

Daily Dama turns scattered practice into a clear path forward. It helps you understand where you are, choose what to work on next, and begin a focused Sesh in seconds. You can practice one trick, build a multi-trick line, or define your own custom tricks and sequences.

Every lace contributes to something meaningful. Daily Dama tracks your time, pace, personal bests, streaks, goals, notes, and trick history so you can see the work accumulating—not just the tricks you happened to land today.

Whether you’re learning your first cup tricks, preparing for a competition, refining a difficult line, or building your own style, Daily Dama gives your practice structure without taking away the play.

**Know what to practice. Practice with intention. See yourself improve.**

### Short version

Daily Dama is a personal practice companion for kendama players: a guided progression, focused Sesh timer, custom trick notebook, and long-term practice history in one place.

### Core promise

Daily Dama helps kendama players turn “I should practice” into a specific next trick, a focused session, and visible progress over time.
