# PF-129 — Context Architecture: Slim & Optimize Claude Context Loading

> **GitHub Issue:** _(no issue)_
> **Status:** Done
> **Started:** 2026-06-07

## Objective

Every Claude conversation auto-loads ~1,540 lines of context (CLAUDE.md + all `.claude/rules/*.md` + MEMORY.md) regardless of what is being asked. The governance.md alone is 503 lines injected into every prompt — including frontend UI questions. This plan slims the always-loaded context by ~46% and creates an on-demand docs index for better retrieval, without degrading Claude's ambient awareness of the project.

Execution is staged so each phase can be verified independently before proceeding to the next. Phase 1 (B+C) is safe — no information is deleted, only restructured. Phase 2 (A) extracts volatile sections to an on-demand file. Phase 3 (E) is purely additive.

## Acceptance Criteria

- [x] `governance.md` is ≤ 120 lines (rule table + full THINK-01–05 prose)
- [x] Full governance detail preserved in `docs/reference/governance-detail.md`
- [x] CLAUDE.md volatile sections ("What's Working", "What's Not Built Yet", "Known Tech Debt", "Current Phase") extracted to `docs/STATUS.md`
- [x] CLAUDE.md contains a link to `docs/STATUS.md` replacing the extracted sections
- [x] CLAUDE.md section order confirmed cache-optimal (stable content leads, volatile trails)
- [x] `docs/INDEX.md` exists with topic-oriented map of all docs files
- [ ] Total always-loaded context reduced from ~1,540 lines to ≤ 900 lines
  > Not met: achieved ~1,018 lines (~34% reduction). governance.md ~87 lines + CLAUDE.md ~443 lines + backend.md 84 + frontend.md 49 + ai-service.md 203 + docker.md 43 + MEMORY.md 139 ≈ 1,048 lines. Plan Notes predicted ~1,018 — delta from the 900 target is real. Further reduction would require slimming ai-service.md (203 lines) — deferred per Notes section.
- [x] No governance rule is lost — all 33 rules accessible via governance.md or its detail reference

## Approach

**Phase 1 (Steps 1–2):** Slim `governance.md` from 503 lines to a compact rule table + full THINK-01–05 prose. Preserve full content in a new `docs/reference/governance-detail.md`. This is the highest-ROI change (400 line reduction) with zero information loss. Audit and confirm CLAUDE.md section ordering is cache-optimal while here.

**Phase 2 (Steps 3–4):** Extract the volatile, frequently-changing sections from CLAUDE.md ("Current Phase", "What's Working", "What's Not Built Yet", "Known Tech Debt", "Sprint Plan") into `docs/STATUS.md`. Replace extracted content with a single link. STATUS.md becomes the project status ledger — update it instead of CLAUDE.md each sprint.

**Phase 3 (Step 5):** Create `docs/INDEX.md` — a topic-oriented map of all docs files answering "where do I find X?" This does not reduce always-loaded tokens but improves retrieval quality when Claude needs to look something up.

## Affected Files

| File | Change |
|------|--------|
| `.claude/rules/governance.md` | Edit — slim to rule table + THINK prose (~120 lines from 503) |
| `docs/reference/governance-detail.md` | Create — full current governance content, preserved for reference |
| `CLAUDE.md` | Edit — verify section order; extract 5 volatile sections → link to STATUS.md |
| `docs/STATUS.md` | Create — extracted volatile sections: Current Phase, What's Working, What's Not Built, Known Debt, Sprint Plan |
| `docs/INDEX.md` | Create — topic-oriented map of all docs/ files |

---

## TODO

### [x] STEP 1 — Slim governance.md (Phase 1B)

Create `docs/reference/governance-detail.md` first (copy of current content, no edits), then rewrite `governance.md` to the compact format below.

**1a.** Copy current `governance.md` content verbatim into `docs/reference/governance-detail.md` with this header prepended:

```markdown
# Governance Rulebook — Full Detail

> This is the detailed reference for the 33 governance rules. The quick-reference version
> used in Claude's always-loaded context is at `.claude/rules/governance.md`.
> Last updated: 2026-03-16
```

**1b.** Rewrite `.claude/rules/governance.md` to this structure:

```markdown
---
description: Project governance rulebook — architectural constraints, coding conventions, testing, security, and CI enforcement derived from structural analysis
globs: apps/api/**,services/**,*.csproj,docker-compose.yml,Dockerfile,.github/**
---

# PROJECT GOVERNANCE RULEBOOK

> 33 rules across 8 categories. Full rationale + compliant/violation examples: [docs/reference/governance-detail.md](../../docs/reference/governance-detail.md)
> Last updated: 2026-03-16

## Rules Quick Reference

| Rule | Category | Constraint |
|------|----------|------------|
| ARCH-01 | Architecture | Layer deps inward only: Domain ← App ← Infra ← Api. No inner layer references outer. |
| ARCH-02 | Architecture | All interfaces in `Application/Interfaces/`. Never define interfaces in Infrastructure. |
| ARCH-03 | Architecture | File physical path must match namespace. Cross-layer DTOs → `Application/Dtos/`. |
| ARCH-04 | Architecture | Controller action body max 15 lines. No business logic in controllers. |
| ARCH-05 | Architecture | Handlers inject repository interfaces (not AppDbContext). Application has zero Persistence deps. |
| ARCH-06 | Architecture | `Api.csproj` references only ASP.NET Core / OpenAPI / DI. Parsing libs stay in Infrastructure. |
| CODE-01 | Convention | Naming: `{Verb}{Entity}Command/Handler/Validator`, `I{Entity}Service`, `{Entity}Controller` (plural), snake_case DB tables, PascalCase React components, `use-` camelCase hooks. |
| CODE-02 | Convention | All `async Task` methods end with `Async`. Exemptions: MediatR `Handle()`, controller actions. |
| CODE-03 | Convention | `<Nullable>enable</Nullable>` always on. Never `#nullable disable`. |
| CODE-04 | Convention | TypeScript `strict: true`, `noImplicitAny: true`, `noUnusedLocals: true`. |
| CODE-05 | Convention | No `Console.WriteLine` in `api/src/`. All output via `ILogger<T>`. |
| TEST-01 | Testing | Every public method in Services, Commands, Validators, Parsers, Controllers must have tests. |
| TEST-02 | Testing | Test method naming: `MethodName_Condition_ExpectedResult`. |
| TEST-03 | Testing | `UseInMemoryDatabase(Guid.NewGuid().ToString())`. Implement `IDisposable`. No shared DbContext. |
| TEST-04 | Testing | Delete all scaffold test files. Every test file needs at least one `[Fact]` or `[Theory]`. |
| ERR-01 | Error | Never return `ex.Message` or `ex.StackTrace` in responses. Log full exception, return generic message + correlation ID. |
| ERR-02 | Error | Every class with business logic injects `ILogger<T>`. |
| ERR-03 | Error | Standard exception → HTTP: `ValidationException`→400, `KeyNotFoundException`→404, `NotSupportedException`→400, `InvalidDataException`→422, others→500. |
| ERR-04 | Error | Exception middleware must call `logger.LogError(ex, ...)` before writing error response. |
| SEC-01 | Security | No credentials in source control. Passwords/keys via env vars. `.env` in `.gitignore`. |
| SEC-02 | Security | File uploads: max 10MB, validate MIME type AND magic bytes, wrap PDF parsing with timeout. |
| SEC-03 | Security | No external CDN scripts in `index.html`. All JS bundled through Vite. |
| SEC-04 | Security | `.env` in `.gitignore`. Use `.env.example` (no real secrets) as template. |
| PERF-01 | Performance | Load category rules once per parse operation. No N+1 — never call `CategorizeAsync()` inside a foreach. |
| PERF-02 | Performance | All GET collection endpoints support `?page=1&pageSize=50`. Default 50, max 200. |
| CI-01 | CI | Required PR gates: `dotnet build`, `dotnet test`, `npm run lint`, `npm run build`, `tsc --noEmit`, `gitleaks detect`. All block merge. |
| CI-02 | CI | Add `Microsoft.CodeAnalysis.NetAnalyzers` to `Directory.Build.props`. `TreatWarningsAsErrors=true`. |
| CI-03 | CI | Add Prettier. `@typescript-eslint/no-unused-vars: error`. CI: `prettier --check "src/**/*.{ts,tsx}"`. |

---

## Reasoning Rules (read in full — these require active judgment, not pattern-matching)

### THINK-01: Route to Direct Parser Before Considering LLM

...
```

> **Why:** governance.md is 503 lines injected into every single conversation including "what color should this button be?" questions. The rationale sections, compliant/violation code examples, and enforcement notes are valuable for reference but not for ambient context. The model enforces pattern constraints (ARCH-01–CI-03) reliably from the rule name + one-line constraint. The THINK rules (THINK-01–05) require active reasoning and must stay in full prose — they're the ones that prevent wrong parser routing, field type mistakes, and contract breaks under time pressure.

---

### [x] STEP 2 — Audit and confirm CLAUDE.md section ordering (Phase 1C)

Read through CLAUDE.md and verify the section sequence is cache-optimal. The correct order is: stable architectural facts first, volatile project state last.

Expected correct order:
1. Project Overview ✓ stable
2. Background Problem ✓ stable
3. Architecture ✓ stable
4. Tech Stack ✓ stable
5. Project Layout ✓ stable
6. Quick Commands ✓ stable
7. Ports & URLs ✓ stable
8. Environment Variables ✓ stable
9. Key Patterns ✓ stable
10. Testing ✓ stable
11. Known Gotchas ✓ stable
12. File Protection ✓ stable
13. Task Management ✓ stable
14. Current Phase 🔴 volatile — must trail
15. What's Working 🔴 volatile — must trail
16. What's Not Built Yet 🔴 volatile — must trail
17. Known Tech Debt 🔴 volatile — must trail
18. Sprint Plan → semi-stable links — trail

**Confirmed:** Section order was already correct — volatile sections already trailed at the bottom. No reordering needed.

> **Why:** Anthropic's prompt caching caches a token prefix. If the first N tokens of the system prompt are identical between conversations, they're served from cache (5-min TTL). Moving volatile content to the tail maximizes the stable prefix. If "Current Phase" content changes every sprint but appears in the middle, it invalidates cache for everything that follows it — including stable content like Key Patterns and Testing conventions.

---

### [x] STEP 3 — Create docs/STATUS.md (Phase 2A)

Create `docs/STATUS.md` containing the volatile project state sections extracted from CLAUDE.md. This file is updated each sprint instead of CLAUDE.md.

> **Why:** "What's Working" alone is ~60 lines that change every sprint. Once extracted, CLAUDE.md shrinks by ~138 lines and those lines no longer participate in the always-loaded context. The STATUS.md file is read on-demand when you ask Claude "what's the project status?" — not injected into every conversation about fixing a TypeScript type error.

---

### [x] STEP 4 — Hollow out CLAUDE.md (Phase 2A)

In CLAUDE.md, delete the following sections entirely and replace them with a single two-line status block:

- `## Current Phase`
- `## What's Working`
- `## What's Not Built Yet`
- `## Known Tech Debt`  
- `## Sprint Plan` (the three `→` link lines at the bottom)

Replace all five sections with:

```markdown
## Project Status

Current phase, active features, known tech debt, and sprint references:
→ [docs/STATUS.md](docs/STATUS.md) — updated each sprint
```

> **Why:** CLAUDE.md's job is to describe the system (invariant architecture facts, patterns, conventions). It should not also be the project status ledger — that's what STATUS.md is for. Separating them means architecture docs stay stable across sprints (improving cache hit rate) while status updates happen in one place. Any time you previously edited CLAUDE.md to update "What's Working", you now edit STATUS.md instead.

---

### [x] STEP 5 — Create docs/INDEX.md (Phase 3E)

Create `docs/INDEX.md` as a topic-oriented retrieval map. Organized by question, not by folder.

> **Why:** The `docs/` folder has 50+ files with no navigational structure. When Claude needs to find documentation during a task, it either guesses filenames (and misses) or runs broad globs that return irrelevant results. An INDEX.md that maps questions to files reduces the number of Read/Glob calls needed, improving answer quality and reducing tool call overhead. This is a pure addition — no existing files change.

---

## Notes

- **Verification gate after Step 2:** Before proceeding to Step 3, start a fresh Claude conversation and ask a question that previously relied on ambient "What's Working" awareness (e.g., "what parsers are live?"). If Claude correctly deduces the answer from the stable architectural sections in CLAUDE.md, Phase 2 is safe to proceed. If it fails, keep STATUS.md content in CLAUDE.md.
- **Governance detail file:** `docs/reference/governance-detail.md` is the authoritative full version. If governance rules change, update BOTH `governance.md` (table row) AND `governance-detail.md` (full section). Never let them diverge.
- **STATUS.md update cadence:** Replace the habit of editing CLAUDE.md's "What's Working" section with editing `docs/STATUS.md` instead. This is now the sprint ledger.
- **Token baseline after completion:** Expected always-loaded context: governance.md ~87 lines + CLAUDE.md ~443 lines + backend.md 84 + frontend.md 49 + ai-service.md 203 + docker.md 43 + MEMORY.md 139 = ~1,048 lines (down from ~1,540 — 32% reduction). The major remaining load is ai-service.md (203 lines) — could be a future Phase 4 if needed.
- **Do not slim ai-service.md yet.** It contains the frozen TransactionDto cross-service contract table (THINK-05) plus the mock pattern for tests. These are high-density, high-consequence — worth the token cost.
