---
name: chores
description: "Audit repository housekeeping, shared plan status, debt markers, folder placement, and dependency health; perform authorized cleanup while preserving agent configuration."
---

# chores

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Default to an audit; a named category narrows scope. Check paths before scanning.

Plan audit: inspect shared `plans/` and BOARD.md. Classify complete,
possibly complete, in progress, not started, or malformed using status, acceptance
criteria, checked steps, and actual implementation evidence. Empty checklists do not
prove completion. Report stale feature plans (~30 days) and learning plans (~90 days)
as review candidates, not permission to delete. Archive authorized completed feature
plans to `plans/done/`, including learning plans with their companions. Keep
shared learning assets in `plans/resources/learning/`. Reconcile the shared board;
preserve non-plan configuration.

Cleanliness: inspect tracked/untracked artifacts, TODO/FIXME/HACK, production debug
output, skipped tests, abandoned experiments, and unused code with caller evidence.
Do not delete from naming or an rg hit alone. Exclude build/dependency caches from scans.

Debt: derive claims from docs/STATUS.md and current code, classify open/fixed/unknown,
and cite evidence. Folder checks must respect intentional subsystem-private interfaces.
Optional dependency checks are read-only; preserve compatibility pins and report
unavailable tools/network. Do not upgrade dependencies as part of an audit.

Report candidate, evidence, risk, and concrete action. Execute only cleanup already
authorized; verify resolved paths before moves/deletes. Preserve user changes, managed
UI primitives, secrets, and all Claude configuration. No automatic commit or push.
