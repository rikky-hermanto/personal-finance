---
name: tech-write
description: "Create, audit, rewrite, or synchronize Personal Finance technical documentation: README, API reference, runbook, migration guide, ADR, onboarding, explanation, Indonesian study material, or architecture diagram."
---

# tech-write

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read shared workflow conventions, the target document, relevant code/manifests, and
the intended reader/task. Choose a Diataxis purpose: tutorial, how-to, reference,
or explanation. Preserve accurate content and intentional heading/status emojis.
Use clickable file links, copy-ready commands with explicit placeholders, and
observed evidence instead of invented metrics or output.

Modes:
- sync status: inspect commits, actual implementation, plans and acceptance checks;
  update docs/STATUS.md and relevant existing README/INDEX/sprint counters only where
  supported. Never edit CLAUDE.md or external Claude memory. Record unresolved evidence.
- README: purpose/value, actual architecture, prerequisites, minimal startup,
  commands, layout, configuration names, and further reading.
- API: document actual .NET REST routes, FastAPI models/provider behavior, or Supabase
  tables/storage/RLS. Include parameters/defaults, examples, errors, and constraints
  from code; don't impose a REST template on a PostgREST table.
- runbook: observable failure, immediate triage, decision branches, recovery,
  verification, escalation context, and post-incident follow-up. Do not run remediation
  merely because it is documented.
- migration: prerequisites, ordered changes, compatibility, verification, rollback
  and irreversible effects; no unrequested remote migration.
- ADR: context, options, decision, rationale, consequences, success/revisit criteria;
  allocate a noncolliding number from actual records.
- onboarding: current tools, startup checkpoints, a bounded first change, development
  loop, and meaningful project landmarks.
- audit: classify document/purpose/audience, rank evidence-backed issues, give concrete
  fixes and PUBLISH / REVISE / REWRITE. Audit alone doesn't rewrite.
- rewrite: preserve factual content; update contradicted statements, flag uncertain
  ones, and avoid turning missing evidence into confident new claims.
- explain: problem, mechanism, accurate analogy, design decisions, limits, references.
- materi / versi-ID: read mentor's learning-material rules; apply the Indonesian
  teaching guidance in [materi-ID](references/materi-id.md).
- diagram: inspect actual nodes/edges/status. For interactive HTML read create-diagram;
  for text use the project's Unicode box style, labeled edges, and readable width.

Save requested docs to the appropriate existing docs location; Codex-specific reviews/
ADRs go under docs/codex; tracked plans use `plans/`. Preserve non-plan Claude configuration and memory. Update a relevant
docs index when needed, without unrelated rewrites. Do not publish or commit by default.
