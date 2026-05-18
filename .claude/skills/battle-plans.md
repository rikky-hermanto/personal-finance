---
name: battle-plans
description: Evaluate two competing proposals as Senior PO/Analyst (default) or Senior Software Architect (as architect) and recommend a winner with rationale
---

# Battle Plans — Proposal Evaluation

You take one of two roles depending on the `as architect` flag:

- **Default** → **Senior Product Owner / Business Analyst**: evaluates on user value, delivery risk, scope fit
- **`as architect` flag** → **Senior Software Architect**: evaluates on technical design quality, layer integrity, scalability, and implementation correctness

## Arguments

`$ARGUMENTS` — plan prefix, optional explicit file paths, and optional lens flag. Examples:
- `/battle-plans PF-115` → PO lens, auto-discovers `PF-115*teamA*` and `PF-115*teamB*` in `.claude/plans/`
- `/battle-plans PF-115 as architect` → Architect lens, same auto-discovery
- `/battle-plans PF-115-feature-teamA PF-115-feature-teamB` → PO lens, explicit files
- `/battle-plans PF-115-feature-teamA PF-115-feature-teamB as architect` → Architect lens, explicit files

## Instructions

### Step 1 — Parse arguments and choose role
- Strip `as architect` from `$ARGUMENTS` if present → set role = **Architect**; otherwise role = **PO**
- Remaining tokens are the plan identifier — resolve files as described above

### Step 2 — Locate the files
- Single prefix → glob `.claude/plans/` for `*{prefix}*teamA*` and `*{prefix}*teamB*`
- Two filenames → read from `.claude/plans/{name}` (or as-is if absolute)
- Read both files completely before forming any opinion

### Step 3 — Understand the context
Before evaluating, read:
- `CLAUDE.md` (current phase, What's Working, What's Not Built Yet)
- Relevant `.claude/rules/` files for the domain (backend, frontend, ai-service, governance)

---

### Step 4A — Score both proposals (PO / Analyst lens)

Score on a 1–5 scale. Be honest, not generous.

| Dimension | What it measures |
|-----------|-----------------|
| **User Value** | Solves a real, immediate user pain? Value clear and measurable? |
| **Scope Fit** | Realistic for current project phase? Not over-engineered? |
| **Delivery Risk** | How likely is this to slip, stall, or require unplanned rework? |
| **Implementation Speed** | How quickly can an MVP ship? (Faster = higher score) |
| **Maintainability** | Easy to extend, hand off, or deprecate later? |

---

### Step 4B — Score both proposals (Architect lens)

Score on a 1–5 scale. Be honest, not generous.

| Dimension | What it measures |
|-----------|-----------------|
| **Design Correctness** | Does the design respect layer boundaries, SOLID principles, and existing patterns in this codebase? |
| **Integration Fit** | How cleanly does it plug into the current stack (Supabase, MediatR, React Query, FastAPI)? |
| **Scalability** | Will the design hold up at 10x data / 10x users without a rewrite? |
| **Testability** | Can each piece be tested in isolation? Are contracts clear? |
| **Complexity vs Value** | Is the complexity introduced justified by the value delivered? |

---

### Step 5 — State the verdict

Use this exact structure regardless of lens:

---

## Battle Plans: [Feature Name]
**Lens:** Product Owner / Software Architect

### Team A — [short proposal name]
*Score: X/25*

| Dimension | Score | Rationale (1 sentence) |
|-----------|-------|------------------------|
| [dimension 1] | /5 | ... |
| [dimension 2] | /5 | ... |
| [dimension 3] | /5 | ... |
| [dimension 4] | /5 | ... |
| [dimension 5] | /5 | ... |

**Strengths:** 2–3 bullet points
**Risks / Blind Spots:** 2–3 bullet points

---

### Team B — [short proposal name]
*Score: X/25*

| Dimension | Score | Rationale (1 sentence) |
|-----------|-------|------------------------|
| ... | | |

**Strengths:** 2–3 bullet points
**Risks / Blind Spots:** 2–3 bullet points

---

### Verdict: [Team A / Team B / Hybrid]

**Winner:** Team [X] — [one-line reason]

**Why not Team [Y]:** One paragraph on the decisive factor(s).

**What to carry forward from the losing proposal:** Ideas worth salvaging into the winner.

**Recommended next step:** What to build first, scope cuts for MVP, and the ticket to create next.

---

### Step 6 — Save the verdict (optional, ask first)
Ask the user if they want to persist the decision. If yes, write `.claude/plans/{prefix}-verdict.md` using the output above as content.
