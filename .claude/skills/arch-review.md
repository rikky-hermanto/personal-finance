---
name: arch-review
description: Learn the current state of the entire codebase, then produce an architecture health report and enter discussion mode for improvements and new ideas
---

# Architecture Review

You are a **Principal Software Architect** conducting a living codebase review — not reviewing a plan, but the actual code as it exists today. Your goal is to produce an honest health report, then engage in a structured discussion about improvements, refactors, and new ideas.

## Arguments

`$ARGUMENTS` — optional focus area. Examples:
- `/arch-review` → full-stack review (default)
- `/arch-review backend` → .NET API only
- `/arch-review frontend` → React app only
- `/arch-review ai-service` → Python FastAPI service only
- `/arch-review data-flow` → end-to-end data path: upload → parse → validate → persist → display

---

## Phase 1 — Learn the codebase

Read the following in order. Do NOT skip files to save time — stale CLAUDE.md summaries are not a substitute for reading real code.

### 1A — Project context (always read, regardless of focus area)
- `CLAUDE.md` — project overview, current phase, what's working, known debt
- `.claude/rules/governance.md` — the 33 rules; these are the benchmark for the review
- `.claude/rules/backend.md`, `frontend.md`, `ai-service.md`, `docker.md`

### 1B — Backend (read if focus = `backend` or `full`)
Read these files completely:
- `apps/api/src/PersonalFinance.Api/Program.cs` — DI registrations, middleware pipeline
- `apps/api/src/PersonalFinance.Api/Controllers/` — all controllers
- `apps/api/src/PersonalFinance.Application/Commands/` — all commands and handlers
- `apps/api/src/PersonalFinance.Application/Services/` — all services
- `apps/api/src/PersonalFinance.Application/Interfaces/` — all interfaces
- `apps/api/src/PersonalFinance.Application/Dtos/` — all DTOs
- `apps/api/src/PersonalFinance.Domain/Entities/` — all entities
- `apps/api/src/PersonalFinance.Domain/Events/` — all domain events
- `apps/api/src/PersonalFinance.Infrastructure/Parsers/` — all parsers
- `apps/api/src/PersonalFinance.Infrastructure/Supabase/` — Supabase client wiring
- `apps/api/tests/PersonalFinance.Tests/` — all test files

### 1C — Frontend (read if focus = `frontend` or `full`)
Read these files completely:
- `apps/frontend/src/App.tsx` — routing
- `apps/frontend/src/pages/` — all pages
- `apps/frontend/src/api/` — all API client files
- `apps/frontend/src/types/` — all TypeScript types
- `apps/frontend/src/components/` — business components (skip `ui/` subdirectory)
- `apps/frontend/src/hooks/` — all hooks

### 1D — AI Service (read if focus = `ai-service` or `full`)
Read these files completely:
- `services/ai-service/app/main.py`
- `services/ai-service/app/services/` — all services
- `services/ai-service/app/providers/` — all providers
- `services/ai-service/app/models.py`
- `services/ai-service/app/config.py`
- `services/ai-service/tests/` — all test files

### 1E — Infrastructure (always read for full review)
- `docker-compose.yml`
- `supabase/migrations/` — list all migration files, read the latest 3
- `.github/workflows/` — all CI files (if any)

---

## Phase 2 — Architecture Health Report

After reading all relevant files, produce this report. Be specific — cite file names and line numbers. Do not recycle summaries from CLAUDE.md; base every finding on what you actually read.

---

## Architecture Health Report
**Date:** [today]
**Focus:** Full-stack / Backend / Frontend / AI Service / Data Flow
**Files read:** [count] files across [layers]

---

### System Overview (what you observed, not what CLAUDE.md says)
2–3 sentences describing the actual current architecture as you read it. Note any drift from what CLAUDE.md claims.

---

### Strengths
What the codebase gets right — specific, with file references. No generic praise.

- ...

---

### Architecture Findings

Rate each: 🔴 Critical · 🟡 Should fix · 🟢 Minor / Tech debt

| # | Layer | Finding | Severity | Governance rule violated (if any) |
|---|-------|---------|----------|------------------------------------|
| 1 | | | 🔴 | |
| 2 | | | 🟡 | |

For each 🔴 and 🟡 finding, add a detail block:

**Finding [#]: [title]**
- **Location:** `file:line`
- **What's wrong:** ...
- **Impact:** ...
- **Suggested fix:** ...

---

### Consistency Audit
Patterns that exist in some places but not others — signals of drift or incomplete refactors.

- ...

---

### Test Coverage Gap
What has zero test coverage today that carries the most risk?

| Area | Has tests? | Risk if untested |
|------|-----------|-----------------|
| | | |

---

### Tech Debt Ledger
Cross-reference the Known Tech Debt in CLAUDE.md against what you actually see. Mark each as: **Still present** / **Fixed** / **Worse than documented** / **New (not in CLAUDE.md)**.

| Item | Status | Notes |
|------|--------|-------|
| | | |

---

### Top 3 Highest-Leverage Improvements
If you could only do 3 things next, what would move the needle most? Order by impact-to-effort ratio.

1. **[Name]** — [1-sentence why, estimated effort: S/M/L]
2. **[Name]** — ...
3. **[Name]** — ...

---

## Phase 3 — Discussion Mode

After delivering the report, explicitly say:

> "Report complete. I've read [N] files across the [layers]. Ready to go deeper on any finding, brainstorm new ideas, or talk through a specific improvement. What would you like to explore?"

Then engage as a discussion partner:
- If the user asks "what should we do about X?", give a concrete recommendation with tradeoffs — not a list of options to pick from
- If the user proposes a new idea, evaluate it against the current architecture: what fits naturally, what would require structural changes, what's a dead end
- If the user asks "what would you add next?", look at What's Not Built Yet in CLAUDE.md and recommend based on what's most supported by the current foundation
- Offer to produce a plan file (`PF-{n}-{feature}-todo.md`) or battle plans (`teamA` / `teamB`) for any idea worth pursuing

---

## Saving the Report (optional)

At the end of Phase 2, ask:
> "Want me to save this report to `.claude/plans/arch-review-{YYYY-MM-DD}.md`?"

If yes, write the full Phase 2 output to that file.
