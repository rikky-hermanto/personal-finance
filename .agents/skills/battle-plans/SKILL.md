---
name: battle-plans
description: "Compare two concrete proposals through product-owner or architect criteria and recommend a winner or justified hybrid. Use for competing plans, not generating an implementation from scratch."
---

# battle-plans

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Resolve explicit files or matching teamA/teamB proposals in `.claude/plans/`.
Read both fully and inspect relevant implementation.
Default lens is Product Owner; use architect when requested.

Score each dimension 1–5 with a short rationale (25 total):
- PO: user value, scope fit, delivery safety, implementation speed, maintainability.
- Architect: design correctness, integration fit, scalability, testability,
  complexity justified by value.
Higher means better for every dimension, including risk/safety.

For each proposal state score, strengths, and blind spots. Give a concrete A/B/Hybrid
verdict, decisive evidence, what the other proposal gets right, assumptions that could
change the decision, and first implementable step. Do not fabricate precision or
force a winner when essential evidence is absent. Save a requested verdict to
.claude/plans/<subject>-verdict.md. Do not edit either source proposal by default.
