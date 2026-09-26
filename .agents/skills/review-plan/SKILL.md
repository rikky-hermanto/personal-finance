---
name: review-plan
description: "Review an implementation plan through architect or product-owner criteria and identify gaps, dependencies, risks, and actionable improvements before execution."
---

# review-plan

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read the specified plan fully. Resolve the given path or the shared `.claude/plans/`
tree. Default is architect; use PO when requested. Inspect relevant
implementation and rules so review findings are grounded in current architecture.

Architect lens: ownership/layering, contracts, persistence/migrations, dependencies,
failure modes, security/financial correctness, testability, rollout and rollback.
PO lens: user problem, scope, acceptance criteria, complete flow, prerequisites,
delivery risk, and measurable value.

Return readiness verdict, blockers, improvements, evidence, and exact plan changes
that resolve the gaps. Distinguish missing detail from an actual wrong design.
Do not execute the plan from a review request.

When revision is requested, edit the shared source directly. Re-read before patching,
preserve concurrent edits/history, and update board status when relevant.
