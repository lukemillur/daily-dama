# Tasks — Done Archive

Completed entries move here from `TASKS.md`'s `Backlog`, in the same commit that closes them out. This file is history, not a work queue — it is intentionally **not** part of the top-to-bottom read `TASKS.md` asks for when picking up new work, since a finished task has no bearing on what to do next. Consult it only when you need context on a specific completed task — its resolved decisions, exit criteria, or notes — that isn't already captured elsewhere (commit messages, code comments where warranted).

Entries keep their content as it was at completion. Don't retroactively edit a description or exit criteria after the fact; if something about a completed task turns out to be wrong or misleading, note that in a new entry or in code, not by rewriting history here.

---

### [T001] Add laced count to trick list

- **Area:** Tricks
- **Priority:** High
- **Status:** Done
- **Description:** Trick list items display how many times each trick has been laced (landed), derived from practice history.
- **Exit criteria:** Test confirms the trick list renders the correct laced count per trick from a given set of practice-history records; spot-checked in-browser against real data.
- **Notes:** Purely derived/display — no new persistence.
