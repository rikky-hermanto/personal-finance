---
name: plan
description: "Turn a Personal Finance bug, feature, or refactor request into an evidence-based implementation plan with compared approaches, acceptance criteria, dependencies, and checks."
---

# plan

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read shared conventions, relevant rules/code, product status, and matching historical
plans. Resolve PF IDs through actual files/linked issues, not guessed issue numbers.
Identify user problem, scope, success criteria, constraints, and missing prerequisites.

For a nontrivial decision, propose 2–3 credible approaches and score 1–5:
- bug: root-cause coverage, low blast radius, regression safety, speed, governance;
- feature: user value, scope fit, integration fit, testability, governance;
- refactor: correctness gain, compatibility, testability gain, realism, governance.
Explain the decisive tradeoff; avoid manufactured alternatives for a one-line fix.
Honor an architect lens when requested. Use financial/risk/compliance review where
the substance requires it, without pretending those reviews ran.

Save a requested plan automatically to .claude/plans/<ticket-or-slug>-todo.md.
Include objective, source/context, status/date, acceptance checkboxes, approach,
affected files, ordered STEP headings, purpose, exact relevant commands/paths,
verification expectations, dependencies, rollout/rollback where relevant, and notes.
Use PowerShell-compatible commands and distinguish placeholders from executable values.

Learning plans go in learning/ and follow mentor's ladder-first anatomy, .NET
analogies, study references, experiments, C# equivalents, and knowledge checks.
Plan artifact creation does not execute its steps or authorize a commit.

Update the shared `.claude/plans/BOARD.md` for the new/revised task without claiming
unperformed GitHub synchronization. Never hardcode the next ticket number. End with the
saved file and material open questions; use execute only when implementation is requested.
