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

**`as architect` mode:** skip the PO/user-value scoring dimensions entirely — score only with the technical grid (use the Refactor grid, or the Feature grid with **User value** replaced by **Architectural correctness**). The verdict focuses on technical correctness and architecture fit, not product value.

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

**Ticket ID resolution (do this explicitly):**

- **If the use case is a ticket number** (e.g. `PF-116`):
  1. Look it up in `.claude/plans/BOARD.md` for the ticket entry and context.
  2. If not in the snapshot, fall back to `gh issue view <number> --repo rikky-hermanto/personal-finance` before declaring it not found.
  3. Only if both miss, note "ticket not found in board or GitHub — planning from description only".
- **If the use case is a raw description with no ticket:**
  1. Find the highest existing `PF-XXX` across `.claude/plans/BOARD.md` **and** GitHub issues (`gh issue list --repo rikky-hermanto/personal-finance --search "[PF-" --limit 10`).
  2. Allocate the next ID (`PF-YYY`) for this plan — this prevents ID collisions.
  3. After planning, tell the user to create the GitHub issue titled `[PF-YYY] {title}` (or offer to create it via `gh issue create`).

---

### Step 3 — Generate 2–3 solution approaches

For each approach, write:
- **Name** (2–4 words, e.g. "Cached query layer", "Frontend-only filter", "Dedicated aggregate command")
- **Core idea** (1–2 sentences: the fundamental mechanism)
- **What changes** (bullet list: files/layers/services affected)
- **Tradeoffs** (1 sentence on what you gain, 1 on what you give up)

Approaches must be genuinely different — not just minor variations. To qualify as different, each approach must differ from the others in at least one of these objective dimensions:
- **Layer** — where the work lives (backend / frontend / AI service)
- **Data structure or schema** — different tables, columns, entities, or contracts
- **Scope** — incremental patch vs comprehensive redesign
- **Synchronicity** — sync vs async vs event-driven

Reject candidate approaches that differ only in parameter values or naming — those are variations, not alternatives. One approach should always be the "smallest possible change" and one should be the "most correct long-term design." The third (if needed) is the hybrid.

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

**Governance alignment:** [Name the specific governance.md rules this plan touches (e.g. ARCH-02, CODE-02, PERF-01) and confirm the winning approach complies with each — or flag any rule that needs a conscious exception.]

**What to carry from the losing approach(es):** Ideas worth folding into the winner.
```

---

### Step 6 — Generate the implementation plan

Write the plan in the exact style of `.claude/plans/completed/PF-009-gemini-hello-llm-todo.md` (the canonical example). The plan must use this structure.

**Step-writing rules (apply to every TODO step — read before writing the TODO section):**
- Every step must be independently committable (a junior dev can do step 3 without having read step 4)
- No step should represent more than half a day's work — split if necessary
- Steps that are "run this command" get a bash block; steps that are "create this file" get the full file content in a code block
- `> **Why:**` is mandatory on every step — this is the learning scaffold, not just a checklist
- Steps start unchecked `[ ]`; only mark `[x]` for steps already done before plan was written

```markdown
# [Ticket ID] — [Short descriptive title]

> **GitHub Issue:** #[number]
> **Status:** To Do
> **Started:** [YYYY-MM-DD]
> **Planned from branch:** [branch]

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

---

### Step 7 — Save the plan (automatic)

After outputting the plan, **always** save it automatically — do not ask:

- Write the file with the Write tool to `.claude/plans/PF-{number}-{short-kebab-slug}-todo.md` using the plan content from Step 6 only (no scoring tables, no verdict — just the plan)
- **Filename convention is mandatory:** `PF-{number}-{short-kebab-slug}-todo.md` (e.g. `PF-124-bankidentifier-matcher-registry-todo.md`). NEVER omit the slug — `PF-124-todo.md` is wrong. Use the ticket ID resolved/allocated in Step 2.
- Update `.claude/plans/BOARD.md`: add a row for the new ticket under the **Ready** column (or appropriate column if status is clear from context)
- Tell the user where the file was saved: `Saved to .claude/plans/{filename}`

---

## Skill Chain

After delivering the plan, offer the natural next steps:

> "Next steps with this plan:
> - `/review-plan {filename}` — have a Senior Architect stress-test it before execution
> - `/execute {filename}` — once approved, implement every step end-to-end
> - `/battle-plans {prefix}` — if you have an alternative plan and want a head-to-head
> - `/pm-brainstorm analyze {feature}` — if you want a PM lens before committing to this direction"
