# Personal Finance — Kanban Board

> **Current Sprint:** Cleanup → then Ramp-Up (Week 0)
> **Last Updated:** 2026-03-08
> **WIP Limit:** 2 tasks in progress

---

## Backlog

| ID | Task | Sprint | Labels |
|----|------|--------|--------|
| [PF-034](tasks/PF-034.md) | Backend test suite — Command handlers & validators | cleanup | `testing` `infra` |
| [PF-035](tasks/PF-035.md) | Backend test suite — Bank statement parsers | cleanup | `testing` `infra` |
| [PF-036](tasks/PF-036.md) | Backend test suite — TransactionService | cleanup | `testing` `infra` |
| [PF-037](tasks/PF-037.md) | Backend integration tests — Controllers | cleanup | `testing` `infra` |
| [PF-038](tasks/PF-038.md) | Frontend test setup — Vitest + React Testing Library | cleanup | `testing` `infra` |
| [PF-039](tasks/PF-039.md) | Bug — N+1 in SubmitTransactions (GetAllAsync per loop) | cleanup | `bug` `infra` |
| [PF-040](tasks/PF-040.md) | Bug — Dashboard cash flow ignores year/month params | cleanup | `bug` `feature` |
| [PF-012](tasks/PF-012.md) | PDF text extraction with PyMuPDF | ramp-up | `learning` `ai` |
| [PF-013](tasks/PF-013.md) | End-to-end: .NET → Python → LLM pipeline | ramp-up | `feature` `ai` |
| [PF-014](tasks/PF-014.md) | Persist AI-parsed transactions to DB | ramp-up | `feature` |
| [PF-015](tasks/PF-015.md) | LLM provider abstraction layer | S1 | `feature` `ai` |
| [PF-016](tasks/PF-016.md) | AI-powered auto-categorization | S1 | `feature` `ai` |
| [PF-017](tasks/PF-017.md) | Natural language transaction query | S1 | `feature` `ai` |
| [PF-018](tasks/PF-018.md) | pgvector setup + embedding generation | S2 | `infra` `ai` |
| [PF-019](tasks/PF-019.md) | RAG pipeline for transaction queries | S2 | `feature` `ai` |
| [PF-020](tasks/PF-020.md) | Semantic search API endpoint | S2 | `feature` `ai` |
| [PF-021](tasks/PF-021.md) | Function calling — API endpoints as LLM tools | S3 | `feature` `ai` |
| [PF-022](tasks/PF-022.md) | Agent loop with Semantic Kernel | S3 | `feature` `ai` |
| [PF-023](tasks/PF-023.md) | Multi-turn agent conversation | S3 | `feature` `ai` |
| [PF-024](tasks/PF-024.md) | AI observability + cost tracking | S4 | `infra` `ai` |
| [PF-025](tasks/PF-025.md) | Semantic caching layer | S4 | `feature` `ai` |
| [PF-026](tasks/PF-026.md) | Auth0 integration + security hardening | S4 | `infra` |

---

## Ready

| ID | Task | Sprint | Labels |
|----|------|--------|--------|
| [PF-028](tasks/PF-028.md) | Fix exception detail leaking to API clients | cleanup | `infra` |
| [PF-029](tasks/PF-029.md) | Fix N+1 query in CategorizeAsync | cleanup | `infra` |
| [PF-031](tasks/PF-031.md) | Extract dashboard aggregation from controller | cleanup | `infra` |
| [PF-009](tasks/PF-009.md) | Hello LLM — first Anthropic API call | ramp-up | `learning` `ai` |
| [PF-010](tasks/PF-010.md) | Structured output — text → JSON via LLM | ramp-up | `learning` `ai` |
| [PF-011](tasks/PF-011.md) | FastAPI AI microservice scaffold | ramp-up | `learning` `ai` `infra` |

---

## In Progress

| ID | Task | Sprint | Labels | Started |
|----|------|--------|--------|---------|
| [PF-041](tasks/PF-041.md) | E2E functional test infrastructure — Playwright | cleanup | `testing` `infra` | 2026-03-08 |

---

## Review

| ID | Task | Sprint | Labels |
|----|------|--------|--------|
| — | — | — | — |

---

## Done

| ID | Task | Sprint | Labels | Completed |
|----|------|--------|--------|-----------|
| [PF-001](tasks/PF-001.md) | .NET Web API with Clean Architecture | setup | `infra` | 2026-02 |
| [PF-002](tasks/PF-002.md) | React + Vite frontend scaffold | setup | `infra` | 2026-02 |
| [PF-003](tasks/PF-003.md) | Docker Compose orchestration | setup | `infra` | 2026-02 |
| [PF-004](tasks/PF-004.md) | EF Core + PostgreSQL schema & migrations | setup | `infra` | 2026-02 |
| [PF-005](tasks/PF-005.md) | Bank statement CSV/PDF parsers | setup | `feature` | 2026-02 |
| [PF-006](tasks/PF-006.md) | CQRS + MediatR pipeline | setup | `infra` | 2026-02 |
| [PF-007](tasks/PF-007.md) | Category rules feature (CRUD) | setup | `feature` | 2026-02 |
| [PF-008](tasks/PF-008.md) | Cash flow dashboard with charts | setup | `feature` | 2026-02 |
| [PF-027](tasks/PF-027.md) | Delete scaffold leftovers and dead code | cleanup | `infra` | 2026-03 |
| [PF-030](tasks/PF-030.md) | Move DTOs to correct project | cleanup | `infra` | 2026-03 |
| [PF-032](tasks/PF-032.md) | Update PROJECT_CONTEXT.md to match codebase | cleanup | `docs` | 2026-03 |
| [PF-033](tasks/PF-033.md) | Add Current Phase section to CLAUDE.md | cleanup | `docs` | 2026-03 |

---

## CI / E2E Gate

`npx playwright test` — runs all E2E specs in `e2e/`. Requires full stack running (`docker compose up -d` or local dev servers).

```
npm run e2e       # headless Chromium
npm run e2e:ui    # Playwright UI mode
```

---

## Progress

```
Setup:    ████████████████████ 100% (8/8)
Cleanup:  ███████████░░░░░░░░░  31% (4/13)
Ramp-Up:  ░░░░░░░░░░░░░░░░░░░░   0% (0/6)
Sprint 1: ░░░░░░░░░░░░░░░░░░░░   0% (0/3)
Sprint 2: ░░░░░░░░░░░░░░░░░░░░   0% (0/3)
Sprint 3: ░░░░░░░░░░░░░░░░░░░░   0% (0/3)
Sprint 4: ░░░░░░░░░░░░░░░░░░░░   0% (0/3)
──────────────────────────────────
Overall:  ████░░░░░░░░░░░░░░░░  29% (12/41)
```
