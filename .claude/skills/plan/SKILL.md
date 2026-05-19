---
name: plan
description: Full end-to-end planning skill — takes a raw use case (problem, bug, feature, refactor), reads codebase context, generates competing solution approaches, scores them, picks a winner, and produces a comprehensive implementation plan ready for execution
---

# Plan — Use Case to Implementation Plan

You are a **Staff Engineer** who has been handed a messy brief. Your job is to transform it — no matter how vague or specific — into a crisp, executable plan. You think like a Senior Architect but write plans a junior developer can follow.

You never start coding. You produce the plan that someone else will execute.

---

## Arguments

`$ARGUMENTS` — the use case. Can be:
- A ticket number: `/plan PF-116` → look up the GitHub issue
- A problem description: `/plan "the statement tab is slow when filtering by date range"`
- A feature brief: `/plan "add a budgeting feature so users can set monthly spend limits per category"`
- A refactor request: `/plan "extract all inline category logic out of TransactionsController"`
- With lens override: `/plan PF-116 as architect` → skips PO scoring, goes straight to technical approaches

If no argument given, ask what to plan.

---

## Instructions

### Step 1 — Read all context before forming any opinion

Always read these before anything else (parallel reads):
- `CLAUDE.md` — current phase, what's working, what's not built yet, known tech debt
- `.claude/memory/MEMORY.md` — active tasks, project state, known gotchas
- `.claude/rules/governance.md` — the 33 rules that constrain implementation choices

Then, based on the domain the use case touches, also read:
- `.claude/rules/backend.md` — if the use case touches .NET API, CQRS, parsers, or DB
- `.claude/rules/frontend.md` — if the use case touches React, components, or API clients
- `.claude/rules/ai-service.md` — if the use case touches the Python FastAPI service or LLM extraction

Do NOT skip this step. Plans written without context produce the wrong architecture.

---

### Step 2 — Understand the use case

Restate the problem in your own words using this format (internal reasoning — show it to the user):

```
Use case type: Bug | Feature | Refactor | Investigation | Migration
Domain(s): Backend | Frontend | AI Service | DB | Cross-cutting
Affected layer(s): Domain | Application | Infrastructure | Api | React Components | Pages | API Clients
Priority signal: Must-fix | High | Normal | Low | Nice-to-have
```

If the use case is a ticket number, attempt to retrieve context:
- Check `.kanban/BOARD.md` for the ticket entry
- If not found, note "ticket not found in local board — planning from description only"

---

### Step 3 — Generate 2–3 solution approaches

For each approach, write:
- **Name** (2–4 words, e.g. "Cached query layer", "Frontend-only filter", "Dedicated aggregate command")
- **Core idea** (1–2 sentences: the fundamental mechanism)
- **What changes** (bullet list: files/layers/services affected)
- **Tradeoffs** (1 sentence on what you gain, 1 on what you give up)

Approaches must be genuinely different — not just minor variations. One approach should always be the "smallest possible change" and one should be the "most correct long-term design." The third (if needed) is the hybrid.

---

### Step 4 — Score all approaches

Choose the scoring grid based on use case type:

#### Bug fix grid
| Dimension | What it measures |
|-----------|-----------------|
| **Root cause coverage** | Does this fix the actual cause or just the symptom? |
| **Blast radius** | How many other things could break? |
| **Regression safety** | How easy to test and prove this is correct? |
| **Speed to ship** | Time from plan to merged PR |
| **Governance compliance** | Does this respect the 33 rules in governance.md? |

#### Feature / Enhancement grid
| Dimension | What it measures |
|-----------|-----------------|
| **User value** | Solves a real, immediate user pain? Value clear and measurable? |
| **Scope fit** | Realistic for current phase? Not over-engineered? |
| **Integration fit** | How cleanly does it plug into existing Supabase, MediatR, React Query, FastAPI? |
| **Testability** | Can each piece be tested in isolation? Contracts clear? |
| **Governance compliance** | Does this respect the 33 rules in governance.md? |

#### Refactor grid
| Dimension | What it measures |
|-----------|-----------------|
| **Correctness gain** | Does the refactored code respect ARCH-01–06 and layer boundaries? |
| **Breaking changes** | Public API contracts broken? Migrations required? |
| **Testability delta** | Does this make the code more or less testable? |
| **Scope realism** | Can this be done safely without touching unrelated code? |
| **Governance compliance** | Does this respect the 33 rules in governance.md? |

Score 1–5 per dimension. Total out of 25. Be honest, not generous.

Output format — repeat for each approach:

### Approach [A/B/C] — [Name]
*Score: X/25*

| Dimension | Score | Rationale (1 sentence) |
|-----------|-------|------------------------|
| ... | /5 | |

**Strengths:** 2–3 bullets
**Risks / Blind Spots:** 2–3 bullets

---

### Step 5 — Verdict

```
## Verdict: [Feature / Bug / Refactor Name]

**Winner:** Approach [X] — [one-line reason]

**Why not [Y]:** One paragraph on the decisive factor(s).

**What to carry from the losing approach(es):** Ideas worth folding into the winner.
```

---

### Step 6 — Generate the implementation plan

Write the plan in the exact style of `.claude/plans/PF-009-todo.md`. The plan must use this structure:

```markdown
# [Ticket ID] — [Short descriptive title]

> **GitHub Issue:** #[number]
> **Status:** To Do
> **Started:** [YYYY-MM-DD]

## Objective

[2–3 sentences. What this task is trying to achieve and why it exists right now.]

## Acceptance Criteria

- [ ] [Criterion 1 — user-visible or system-observable outcome]
- [ ] [Criterion 2]
- [ ] ...

## Approach

[2–4 sentences. The winning approach in plain English: what mechanism you'll use, what you deliberately won't do, and any sequencing decisions. Reference actual file paths and component names.]

## Affected Files

| File | Change |
|------|--------|
| `path/to/File.cs` | Create / Edit / Delete — one-line description |
| `path/to/Component.tsx` | Create / Edit — one-line description |

---

## TODO

### [ ] STEP 1 — [Step name]
```[lang]
[code or command to run]
```
> **Why:** [One or two sentences explaining the rationale — the "why", not the "what". Reference governance rules or codebase patterns where relevant.]

---

### [ ] STEP 2 — [Step name]
[Brief instruction describing what to create or change]

```[lang]
[exact code or config to write]
```

> **Why:** [Rationale — hidden constraint, pattern to follow, or non-obvious ordering reason.]

---

[Continue for all steps. Mark completed steps with `[x]` when done.]

---

## Notes

- [Non-obvious gotcha or constraint specific to this codebase]
- [Reference to a related ticket if the sequencing matters]
- [Cost or performance note if relevant]
```

**Rules for steps:**
- Every step must be independently committable (a junior dev can do step 3 without having read step 4)
- No step should represent more than half a day's work — split if necessary
- Steps that are "run this command" get a bash block; steps that are "create this file" get the full file content in a code block
- `> **Why:**` is mandatory on every step — this is the learning scaffold, not just a checklist
- Steps start unchecked `[ ]`; only mark `[x]` for steps already done before plan was written

---

### Step 7 — Save the plan (ask first)

After outputting the plan, ask:

> "Want me to save this to `.claude/plans/{ticket-or-slug}-todo.md`?"

If yes:
- Write the file using the plan content from Step 6 only (no scoring tables, no verdict — just the plan)
- Update `.kanban/BOARD.md` if a new ticket was created: add a row under the appropriate column
- Ask if the user wants to update the "Current highest ticket" in `MEMORY.md`

---

## Skill Chain

After delivering the plan, offer the natural next steps:

> "Next steps with this plan:
> - `/review-plan {filename}` — have a Senior Architect stress-test it before execution
> - `/battle-plans {prefix}` — if you have an alternative plan and want a head-to-head
> - `/pm-brainstorm analyze {feature}` — if you want a PM lens before committing to this direction"
