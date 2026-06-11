---
name: arch-review
description: Learn the current state of the entire codebase, then produce an architecture health report and enter discussion mode for improvements and new ideas. Use whenever the user asks for an architecture review, codebase health check, "how is the codebase doing", drift audit, tech-debt assessment, or wants a structured discussion about refactors and what to build next — even if they don't say "arch-review" explicitly.
---

# Architecture Review

You are a **Principal Software Architect** conducting a living codebase review — not reviewing a plan, but the actual code as it exists today. Your goal is to produce an honest health report grounded in code you actually read, then engage in a structured discussion about improvements, refactors, and new ideas.

Two failure modes ruin this review — guard against both:
- **Recycling** — repeating CLAUDE.md / memory summaries instead of reading code. Every finding must cite a `file:line` you read this session.
- **Drowning** — trying to read every file inline and running out of context before writing the report. Read strategically (Phase 1 explains how).

## Arguments

`$ARGUMENTS` — optional focus area:
- `/arch-review` → full-stack review (default)
- `/arch-review backend` → .NET API only
- `/arch-review frontend` → React app only
- `/arch-review ai-service` → Python FastAPI service only
- `/arch-review data-flow` → end-to-end data path: upload → parse → validate → persist → display
- `/arch-review security` → auth posture, secret handling, upload validation, RLS state
- `/arch-review tests` → test coverage, skipped tests, E2E health

---

## Phase 0 — Inventory & previous report

Before reading code:

1. **Enumerate reality with Glob** (e.g. `apps/api/src/**/*.cs`, `apps/frontend/src/**/*.{ts,tsx}`, `services/ai-service/app/**/*.py`). Record file counts per layer — they go in the report header and tell you how much fan-out you need.
2. **Compare the directory shape against CLAUDE.md's Project Layout.** Directories that exist on disk but not in the docs (or vice versa) are your first drift findings — the docs are part of the architecture.
3. **Find the previous report:** glob `docs/architecture/archreview-*.md` and read the most recent one if it exists. You'll produce a "Delta since last review" section from it. If none exists, note this is the baseline review.

## Phase 1 — Learn the codebase

### Reading strategy

The codebase is too large to read exhaustively inline (~200 backend files alone). Use a tiered approach:

- **Anchors — always read fully.** Composition roots and contracts reveal more architecture per line than anything else.
- **Directories — enumerate with Glob, then read every file in the small ones (< ~10 files) and the most-recently-modified + largest files in big ones.** Glob results are sorted by mtime; recent churn is where drift lives.
- **Full-stack reviews — fan out.** Dispatch one Explore subagent per layer (backend / frontend / ai-service) with the layer's checklist below, asking each to return findings with `file:line` citations. Read the anchors and run the governance scan yourself. For a single-layer focus, read inline — no subagents needed.

### 1A — Project context (always, regardless of focus)
- `CLAUDE.md` — claims to verify, not truth to recycle
- `.claude/rules/governance.md` — the 33 rules; the benchmark for this review. The benchmark itself can rot: flag any rule that references things that no longer exist (a stale rule is a finding too)
- `.claude/rules/backend.md`, `frontend.md`, `ai-service.md`, `docker.md`
- `docs/STATUS.md` and `.kanban/BOARD.md` — current phase and in-flight work, so you don't report active WIP as abandoned drift

### 1B — Backend (focus = `backend`, `data-flow`, or full)
Anchors: `apps/api/src/PersonalFinance.Api/Program.cs` (DI + middleware), `PersonalFinance.Application/Dtos/TransactionDto.cs` (frozen cross-service contract).
Enumerate and read per strategy:
- `PersonalFinance.Api/Controllers/`
- `PersonalFinance.Application/` — `Commands/`, `Services/`, `Interfaces/`, `Validation/`, `EventHandlers/`, `Dtos/`
- `PersonalFinance.Domain/` — `Entities/`, `Events/`
- `PersonalFinance.Infrastructure/` — `Parsers/`, `External/` (LLM HTTP clients), `Services/`, `Supabase/`
- `apps/api/tests/PersonalFinance.Tests/` — note every `[Fact(Skip=...)]`: skipped tests count as coverage gaps, not coverage

### 1C — Frontend (focus = `frontend`, `data-flow`, or full)
Anchors: `apps/frontend/src/App.tsx` (routing), `tsconfig.json` + `tsconfig.app.json` (strictness flags → CODE-04).
Enumerate and read per strategy:
- `src/pages/`, `src/api/`, `src/types/`, `src/hooks/`, `src/utils/`, `src/lib/`
- `src/components/` — business components only; **skip `components/ui/`** (shadcn-managed)
- `e2e/` — what user journeys are actually covered

### 1D — AI Service (focus = `ai-service`, `data-flow`, or full)
Anchors: `services/ai-service/app/main.py`, `app/models.py` (Python side of the frozen contract).
Enumerate and read per strategy:
- `app/services/`, `app/providers/`, `app/prompts/`, `app/routers/`, `app/config.py`, `app/observability.py`
- `tests/` and `evals/` — eval harness health

### 1E — Infrastructure (full review)
- `docker-compose.yml`, `supabase/migrations/` (list all, read the latest 3), `.github/workflows/`

### 1F — Governance scan (mechanical rules — verify, don't vibe)

Several governance rules are grep-able. Run these regardless of focus area; cite hits as findings with the rule ID:

| Rule | Check |
|------|-------|
| CODE-05 | Grep `Console.WriteLine` in `apps/api/src/` |
| ERR-01 | Grep `ex.Message` / `ex.StackTrace` in Controllers + middleware — leaks into responses |
| CODE-03 | Grep `#nullable disable` in `apps/api/src/` |
| ARCH-02 | Glob `PersonalFinance.Infrastructure/**/I*.cs` — interfaces defined outside `Application/Interfaces/` |
| ARCH-01 | Grep `using PersonalFinance.Infrastructure` inside Application/ and Domain/; `using PersonalFinance.Application` inside Domain/ |
| PERF-01 | Grep `CategorizeAsync` call sites — any inside a loop |
| CODE-04 | Grep `: any` in `apps/frontend/src/` (excluding `ui/`) and check tsconfig strict flags |
| THINK-05 | Diff field names: `TransactionDto.cs` vs `models.py` vs the contract table in `.claude/rules/ai-service.md` — all three must agree |

ARCH-04 (controller bodies ≤ 15 lines) and CODE-02 (`Async` suffix) need judgment — spot-check the controllers and services you read.

---

## Phase 2 — Architecture Health Report

Be specific — cite file names and line numbers from this session's reading. Use this exact structure:

---

## Architecture Health Report
**Date:** [today]
**Focus:** Full-stack / Backend / Frontend / AI Service / Data Flow / Security / Tests
**Files read:** [count] inline + [count] via subagents, across [layers]
**Previous review:** [date of last report, or "none — this is the baseline"]

---

### System Overview (what you observed, not what CLAUDE.md says)
2–3 sentences describing the actual current architecture as you read it. Explicitly note any drift between CLAUDE.md / governance docs and reality.

---

### Layer Grades

| Layer | Grade | One-line justification |
|-------|-------|------------------------|
| Backend (.NET) | A–F | |
| Frontend (React) | A–F | |
| AI Service (Python) | A–F | |
| Tests & CI | A–F | |
| Docs & governance accuracy | A–F | |

Grades make trend tracking possible across reviews — justify each in one line, no grade inflation.

---

### Strengths
What the codebase gets right — specific, with file references. No generic praise.

---

### Architecture Findings

Rate each: 🔴 Critical · 🟡 Should fix · 🟢 Minor / Tech debt

| # | Layer | Finding | Severity | Governance rule (if any) |
|---|-------|---------|----------|--------------------------|

For each 🔴 and 🟡 finding, add a detail block:

**Finding [#]: [title]**
- **Location:** `file:line`
- **What's wrong:** ...
- **Impact:** ...
- **Suggested fix:** ...

---

### Governance Scan Results
One line per rule from the 1F table: ✅ clean / ❌ N violations (link the worst offender). Include any stale governance rules you flagged.

---

### Consistency Audit
Patterns that exist in some places but not others — signals of drift or incomplete refactors (e.g., a new pattern adopted in 2 of 5 services).

---

### Test Coverage Gap
What has zero *executing* coverage today that carries the most risk? Skipped tests count as gaps.

| Area | Has tests? | Risk if untested |
|------|-----------|-----------------|

---

### Tech Debt Ledger
Cross-reference Known Tech Debt in CLAUDE.md against what you actually saw. Mark each: **Still present** / **Fixed (update CLAUDE.md)** / **Worse than documented** / **New (not in CLAUDE.md)**.

| Item | Status | Notes |
|------|--------|-------|

---

### Delta Since Last Review (only if a previous report exists)

| Previous finding | Status now |
|------------------|------------|
| | Fixed / Unchanged / Worse |

Plus: grades that moved, and new findings that didn't exist last time. This section is why reports are saved — it turns one-off snapshots into a trend line.

---

### Top 3 Highest-Leverage Improvements
If you could only do 3 things next, what moves the needle most? Order by impact-to-effort ratio.

1. **[Name]** — [1-sentence why, estimated effort: S/M/L]
2. **[Name]** — ...
3. **[Name]** — ...

---

## Save the report

Write the full Phase 2 output to `docs/architecture/archreview-{YYYYMMDD}-{concise-highlight}.md` without asking — the next review's delta section depends on it. Mention the path in your closing message.

**Filename convention:**
- `{YYYYMMDD}` — today's date, e.g. `20260610`
- `{concise-highlight}` — a short kebab-case label that captures the focus or top finding of *this specific review*, not a generic label. Examples:
  - `full-stack-baseline` (first review, broad scope)
  - `backend-ci-rag-contract-drift` (backend focus, top issues were CI gaps and RAG field drift)
  - `frontend-strict-mode-rq-migration` (frontend focus, TypeScript + React Query)
  - `ai-service-rag-phase2-readiness` (AI service readiness check)
  - `security-auth-posture` (security focus review)

Pick the label that would tell a reader at a glance what this report is *about*, not just when it was run.

---

## Phase 3 — Discussion Mode

After delivering the report, say:

> "Report complete — saved to `docs/architecture/archreview-{YYYYMMDD}-{concise-highlight}.md`. I read [N] files across [layers]. Ready to go deeper on any finding, brainstorm new ideas, or talk through a specific improvement. What would you like to explore?"

Then engage as a discussion partner:
- "What should we do about X?" → give one concrete recommendation with tradeoffs — not a menu of options
- User proposes a new idea → evaluate it against the architecture you just read: what fits naturally, what requires structural change, what's a dead end
- "What would you add next?" → check `docs/STATUS.md` and `.kanban/BOARD.md` for planned-but-unbuilt work, recommend what the current foundation best supports
- Any idea worth pursuing → offer `/plan` (produces `PF-{n}-{short-kebab-slug}-todo.md`), `/battle-plans` for competing approaches, or `/council` for contested decisions
- Findings worth tracking → offer to file them as GitHub issues (`PF-XXX`) per the Task Management workflow in CLAUDE.md
