---
name: po-review
description: "Check whether a delivered Personal Finance feature satisfies its acceptance criteria, user flow, and regression expectations. Produces an evidence-based ship/send-back verdict."
---

# po-review

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Resolve the plan/spec or actual linked issue, then read changed and connected code:
UI route/component, API client/types, endpoint/handler, storage and event wiring.
Read relevant rules and current product baseline. Do not infer implementation from
a ticket summary or equate PF IDs with issue numbers.

Extract acceptance criteria verbatim or state inferred criteria if no spec exists.
For each, record met/partial/unmet/not verified, evidence, and the user-visible effect.
Check dead buttons, stubbed values, unpersisted state, optimistic-only success, wrong
units, empty/error/loading paths, and missing cross-service wiring.

Report SHIP IT / SEND BACK (minor) / SEND BACK (blocking), decisive issues, acceptance
scorecard, severity-ranked findings with file:line, useful behavior to preserve,
regression surfaces, and verification limits. Tie every blocker to user impact or
a concrete requirement; do not invent findings to fill a template.

A review does not automatically fix code or close issues. Save a requested report
under docs/codex/reviews/. Use ux-review for detailed interaction analysis.
