# Shared plan workspace

The first folder below `plans/` is the **local status** of a task:

| Folder | Meaning |
|---|---|
| `backlog/` | Proposed or deferred work, including items tagged Ready that have not started. |
| `in-progress/` | Work started or implementation awaiting required verification or acceptance. Note blockers in the plan and board. |
| `done/` | Accepted or closed scope. Historical unchecked follow-ups stay recorded in the plan. |
| `cancelled/` | Explicitly cancelled or superseded plans kept for history. |

`Ready` and `Blocked` are board/plan flags, not folders. A task moves only when its actual status changes. Keep related translations and walkthroughs beside their canonical plan under `<status>/learning/`. Shared diagrams, glossary, evidence, and historical reviews live in `resources/` and do not have a task status.

`BOARD.md` remains the local index. GitHub Project #4 is the source of truth for GitHub-linked issues; a local folder move does not change a remote issue. For local-only tasks, keep the folder, plan status, and board row aligned. When moving a plan, update its links and the board in the same task. Preserve completed and cancelled history.
