---
name: execute
description: "Implement an existing Personal Finance plan, verify acceptance criteria and cross-file wiring, and record results directly in the shared plan and board."
---

# execute

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Resolve the plan through shared workflow conventions. Read the complete plan, relevant
code/rules, current diff, and prerequisites. Work directly in the shared source plan;
re-read before progress updates and preserve other agents' changes.

Identify step dependencies: a step consuming another step's output must wait for its
verified completion. Correct stale paths/tools based on code; do not execute obsolete
EF commands or blindly follow historical remote mutations. State material deviations.

Implement each authorized step, inspect produced files, and run its meaningful check.
Accumulate outcomes and update the shared plan at sensible checkpoints/finalization:
success [x], pending [ ], failed/skipped with explicit reason. Do not mark skipped
prerequisites or hoped-for results complete. Continue independent work when blocked.

Verify every acceptance criterion with actual behavior/code/tests. Subjective UI
criteria need an observed preview or an explicit verification limitation. Check DI,
routes, imports, events, schema mappings, provider dispatch, and frontend/backend
contracts: a class that compiles but is never wired is incomplete.

Finish with implemented behavior, plan status, checks, unmet criteria, and blockers.
Commit/push/deploy/remote migration steps run only if the task actually authorizes
them. Update the shared board with verified status. Preserve history and non-plan
Claude configuration; do not execute Claude hooks.
