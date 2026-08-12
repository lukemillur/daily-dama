# Tasks

Fixture backlog for the newTicket workflow scripts. Deliberately independent of
the real `TASKS.md` so tests never depend on the live backlog.

## Needs scoping

- **Something vague** (Low) — should never be selected.

## Backlog

### Terminology note

A non-task heading inside Backlog. Parsing must ignore it.

### [T100] Rename a label on the summary card

- **Area:** Home
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Correct one visible label.
- **Exit criteria:** Tests assert the new label.
- **Notes:** None.

### [T101] Add a derived summary

- **Area:** Stats
- **Priority:** High
- **Status:** Not started
- **Description:** Add a pure selector over existing records.
- **Exit criteria:** Unit tests cover empty and populated input.
- **Notes:** None.

### [T102] Adjust the stored profile shape

- **Area:** persistence
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Change a persisted field.
- **Exit criteria:** Persistence tests pass.
- **Notes:** None.

### [T103] Rework the directory header

- **Area:** Tricks
- **Priority:** Low
- **Status:** Not started
- **Planning:** Required
- **Description:** Restructure a header.
- **Exit criteria:** Component tests pass.
- **Notes:** None.

### [T104] Harden the practice flow

- **Area:** Sesh
- **Priority:** Medium
- **Status:** Not started
- **Description:** Umbrella entry.
- **Notes:** Umbrella only — complete T104.1 and T104.2.

### [T104.1] Add the first flow step

- **Area:** Sesh
- **Priority:** Medium (inherited from parent T104)
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Add one step to the flow.
- **Exit criteria:** Tests cover the new step.
- **Notes:** None.

### [T104.2] Add the second flow step

- **Area:** Sesh
- **Priority:** Medium (inherited from parent T104)
- **Status:** Not started
- **Description:** Add the follow-on step. Depends on T104.1.
- **Exit criteria:** Tests cover the follow-on step.
- **Notes:** None.

### [T105] Document the export command

- **Area:** Repository documentation
- **Priority:** Low
- **Status:** Not started
- **Description:** Write setup docs. Depends on T900.
- **Exit criteria:** A clean-install walkthrough passes.
- **Notes:** None.

### [T106] Decide the notification model

- **Area:** Notifications
- **Priority:** Low
- **Status:** Blocked
- **Description:** Needs a product call first.
- **Exit criteria:** Tests, once unblocked.
- **Notes:** None.

## Done

Completed entries live in TASKS_DONE.fixture.md.
