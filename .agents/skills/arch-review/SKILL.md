---
name: arch-review
description: "Review Personal Finance architecture health, drift, technical debt, and cross-service integration against the current code and Codex rules. Supports full-stack or focused reviews."
---

# arch-review

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Resolve scope (full stack or named layer), current diff, status, historical plans,
and any prior architecture report. Read current manifests and entry points before
judging implementation against documentation. A stale rule/document is a finding.

Trace backend controller→handler/service→Supabase, frontend route→query/client→API,
and AI endpoint→provider/retrieval/storage paths. Inspect DI, error/validation paths,
events, migrations/RLS, external calls, logging, and test coverage. Validate topology
before claiming a service is isolated or a feature is unwired. Include financial
precision, contract parity, N+1 categorization, and UI state handling where relevant.

Apply .agents/rules/governance.md and scoped rules. Preserve intentional private
interfaces such as IBankSignature in Infrastructure; do not flag every interface
outside Application as a defect. No EF or missing-Vitest assumptions.

Produce an evidence-based health report: scope/files checked; implemented topology;
severity-ranked findings with trigger, impact, file:line, rule, and smallest fix;
strengths worth preserving; debt priorities; and a practical evolution path.
Distinguish confirmed defects, risks, stale documentation, and unverified hypotheses.
State checks not run and calibrate recommendations to a solo-maintained product.

Review does not authorize refactors. Save a requested report under docs/codex/reviews/.
Use consult for a focused decision and plan for accepted implementation work.
Parallel reviewers are optional only under current delegation authorization; otherwise
inspect layers sequentially without claiming independent agent review.
