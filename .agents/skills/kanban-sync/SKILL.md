---
name: kanban-sync
description: "Reconcile the shared .claude/plans/BOARD.md with plan progress and relevant GitHub issue status, preserving concurrent edits and local-only tasks."
---

# kanban-sync

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Work directly on `.claude/plans/BOARD.md`. Read shared plans and the board's
source-of-truth declaration first. Preserve existing sections, issue IDs, and other
agents' changes. Never create a parallel board; re-read before patching.

Local mode: reconcile verified plan status and report discrepancies.
GitHub mode applies when requested or the shared board explicitly tracks GitHub
issues. Use available read-only connector/gh queries, paginate fully, and record
partial access rather than calling a capped list complete. Parse PF-, PF-S, and PF-AI
IDs and preserve actual issue numbers.

Closed issues can add Done entries for tracked tasks; do not infer completed
acceptance criteria merely from closure. Report reopened/conflicting states and
untracked open issues for triage. Preserve plan-only rows. Avoid duplicates by stable
ticket/issue identity and escape Markdown table pipes in titles.

Make minimal additive/status updates in the shared board; preserve manual ordering
and notes. Do not delete/reorder historical rows or silently overwrite contradictions.
Update Last synced only for the sources actually checked. No GitHub writes or
Claude hook execution. Report added/updated/conflicting rows
and inaccessible sources.
