# Shared plan workspace

The first folder below `plans/` is the **local status** of a task:

| Folder | Meaning |
|---|---|
| `epics/` | Draft and planned epics, written by the owner and clarified at G1 (loop) |
| `backlog/` | Proposed or deferred work, including items tagged Ready that have not started. |
| `in-progress/` | Work started or implementation awaiting required verification or acceptance. Note blockers in the plan and board. |
| `ready-to-review/` | Tickets that passed the gates and wait for the owner's review at G3 (loop) |
| `done/` | Accepted or closed scope. Historical unchecked follow-ups stay recorded in the plan. |
| `cancelled/` | Explicitly cancelled or superseded plans kept for history. |

`Ready` and `Blocked` are board/plan flags, not folders. Loop flags: `PO-Review NOT PASSED` (frontmatter `review: not-passed`) and a `rework` counter. A task moves only when its actual status changes. Keep related translations and walkthroughs beside their canonical plan under `<status>/learning/`. Shared diagrams, glossary, evidence, and historical reviews live in `resources/` and do not have a task status.

`BOARD.md` remains the local index. GitHub Project #4 is the source of truth for GitHub-linked issues; a local folder move does not change a remote issue. For local-only tasks, keep the folder, plan status, and board row aligned. When moving a plan, update its links and the board in the same task. Preserve completed and cancelled history.

## Status lives in the main checkout

Work may happen in a worktree (`.worktrees/<id>`, branch `loop/<id>`), but the owner tracks tasks from the main checkout: its `plans/` folders and `BOARD.md` are the status. `/loop-run` moves tickets there automatically. A hand-run `/execute` in a worktree starts with `run.mjs start --hand` and ends with `run.mjs sync` (see the execute skill), so the ticket shows `in-progress` while it is worked and stays there until a verifier or the owner moves it. Do not hand-edit plan folders or the generated board block for this.

## Loop

Tickets in `epics/` and `ready-to-review/` are moved by the loop skills; the folder is the status and flags live in the ticket frontmatter.
The block between `<!-- loop:begin -->` and `<!-- loop:end -->` in the board is generated. Edit tickets, not that block.
Flags: `Ready`, `Blocked`, `Loop-Failed`, `PO-Review NOT PASSED` and a `rework` counter.
