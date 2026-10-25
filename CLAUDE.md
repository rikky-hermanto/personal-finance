# Personal Finance — Claude Code Guide

**Start here:** [ai/MAP.md](ai/MAP.md) maps every job (build, decide, write, learn, design) to its skills, templates, and examples.

@ai/shared/preferences.md

## Project Overview

> **"Finance should feel like a game you're winning, not a spreadsheet you're losing."**

Personal Finance is a **gamified personal finance platform** built around a five-tier **Financial Pyramid scoring engine** — showing where you stand (Foundations → Legacy) and what to do next, across transactions, assets, and investments. The mission: make managing money genuinely enjoyable through clarity, progress, and a sense of level-up. Not another budgeting tool. A compass.

**Five modules feed the pyramid:** Journey (home — scoring engine, quests, achievements, Living Garden), Cashflow (transactions + LLM ingestion), Assets (net worth, liabilities), Investment (IDX, funds, bonds, crypto, P2P), Settings. Built on .NET 10 + React 18 + Supabase, with a Python FastAPI AI service for LLM extraction, semantic search, and financial advice.

## Background Problem

### The Real Problem: Clarity and Direction

Most people aren't financially illiterate — they're **directionally lost**. They earn, they spend, they occasionally invest, but without a coherent picture of where they stand or a framework for what to do next. Every financial tool answers a different slice of the question in isolation: a budgeting app here, a broker app there, a bank statement downloaded once a month that nobody reads. Plenty of data, no map.

The result: someone maxing out investments while carrying high-interest debt. Someone diligently saving without knowing whether their emergency fund is adequate. Good intentions, wrong order.

**This platform is built around the Financial Pyramid** — a five-tier hierarchy that makes the correct order explicit. Each level has prerequisites; you can't defend what you haven't built, and you can't grow what you haven't defended.

```
                 ▲
               ████             L5 · Legacy       — Estate planning, succession, tax · no indicator yet
             ████████           L4 · Freedom      — FIRE, passive income · not scored yet (rubric: 35% cleared, 50% mastered of expenses)
           ████████████         L3 · Growth       — Cleared: savings rate ≥ 9% · Mastered: ≥ 15%
         ████████████████       L2 · Defense      — Cleared: cover ≥ 2.1 months and DTI ≤ 29.6% · Mastered: 3 months and ≤ 20%
       ████████████████████     L1 · Foundations  — Cleared: spending ≤ 89% of income · Mastered: ≤ 80%
```

Cleared = every live indicator scores ≥ 70; Mastered = score 100 (per indicator). Spending excludes money you invest or save. DTI is judged once debts are recorded or confirmed. Source: [scoring-rubric.md](docs/ideas/scoring-rubric.md).

A `JourneyScoringService` reads across all data sources — transactions, assets, investments — and computes indicator scores per tier. Score recalculation is event-driven: `TransactionCreatedEvent` and asset mutations auto-trigger recalculation via MediatR domain event handlers. This scoring engine is the product's core, not a feature.

**Five modules feed the pyramid:**
- `/journey` — Home page. 5-tier scoring engine, quest cards, achievements, Living Garden Hero visualization.
- `/cashflow` — Transactions, upload (LLM + CSV hybrid parsing), spending analysis, Safe-to-Spend.
- `/assets` — Properties, vehicles, savings accounts, liabilities, live net worth balance sheet.
- `/investment` — IDX stocks, mutual funds, SBN/ORI bonds, crypto, P2P; AI portfolio review.
- `/settings` — Categories (106 rules), appearance, regional, banks, data reset.

### Data Infrastructure: Managing Cashflow

> ⚠️ This section describes **one sub-feature inside the Cashflow module** — the bank statement ingestion pipeline. It is data plumbing that feeds L1 pyramid scores. It is NOT the product. The product is the pyramid.

The Cashflow module ingests data from 5 Indonesian bank accounts that each produce monthly statements in different formats. This is the plumbing that keeps L1 Foundations scores grounded in reality — without accurate cashflow data, L1 scores are guesses.

Before automation, the workflow was entirely manual:

```
INPUT (5 sources, 3 format types)
├── BCA        → CSV        → column mapping          → Master Cashflow
├── Superbank  → PDF        → LLM extract → validate  → Master Cashflow
├── NeoBank    → PDF        → LLM extract → validate  → Master Cashflow
├── Wise       → CSV        → mapping + FX conversion  → Master Cashflow
└── Bank Jago  → Screenshot → LLM extract → validate  → Master Cashflow
```

**Pain points that automation eliminates:**

```
[Source Format Chaos]     [Manual Conversion]     [Manual Validation]     [Scale Problem]
     ▼                         ▼                        ▼                      ▼
  CSV / PDF / Screenshot → LLM copy-paste → Check format, fix dates → Excel bloating
     │                         │                  fix decimals, etc.        │
     │                         │                        │                   │
     └─── Repeats x5 banks ────┴──── Repeats monthly ───┴── Data grows ─────┘
```

**Two goals for the data layer:**
1. **Automate ingestion** — eliminate manual extraction, validation, and mapping
2. **Make it scalable** — replace Excel with PostgreSQL; adding a new bank = config file, not new code

The solution uses a **hybrid parser strategy** — direct CSV parsing for deterministic formats (BCA, Wise) and LLM extraction (Gemini/Anthropic) for unstructured formats (PDFs, screenshots). An `IBankSignature` Chain of Responsibility registry detects the bank from file content and routes to the correct parser. All paths converge at a five-stage validation pipeline (DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck) before persisting to PostgreSQL.

→ Full cashflow ingestion design — parser routing, bank profiles, validation pipeline, master schema: [docs/features/cashflow-ingestion.md](docs/features/cashflow-ingestion.md)

## Features

Five modules feed the Financial Pyramid scoring engine via `JourneyScoringService`. The Journey module is the home screen — it always shows where you are in the pyramid and what to do next.

| Module | Route | What it tracks | Detailed doc |
|--------|-------|----------------|--------------|
| Journey | `/journey` | Pyramid tier scores, quest cards, achievements, Living Garden Hero | — |
| Cashflow | `/cashflow` | Bank statement ingestion, transactions, spending analysis, Safe-to-Spend | [docs/features/cashflow-ingestion.md](docs/features/cashflow-ingestion.md) |
| Assets | `/assets` | Properties, vehicles, savings accounts, liabilities, net worth balance sheet | — |
| Investment | `/investment` | IDX stocks, mutual funds, SBN/ORI bonds, crypto, P2P; AI portfolio review | — |
| Settings | `/settings` | Category rules (106), banks, appearance, regional, data reset | — |

→ Feature design specs and brainstorms: [docs/features/](docs/features/)
→ Full feature roadmap by pyramid level: [README.md](README.md#the-roadmap-by-level)

## Architecture

React 18 frontend → .NET 10 API (supabase-csharp) → Supabase (PostgreSQL 17 + pgvector, Auth, Storage, Realtime, Webhooks). PDF/image uploads are event-driven: Storage upload → Database Webhook → Python FastAPI AI service → results written back to Supabase → Realtime notifies frontend.

→ Full architecture diagram and event flow: [docs/architecture/architecture-diagram.md](docs/architecture/architecture-diagram.md)
→ Supabase migration rationale and phases: [docs/architecture/supabase-migration.md](docs/architecture/supabase-migration.md)

## Tech Stack

### Backend — Primary (.NET)
- **Runtime:** .NET 10
- **Language:** C# 13
- **API:** ASP.NET Core Web API (REST)
- **Patterns:** CQRS via MediatR, FluentValidation, Clean Architecture
- **Database client:** `supabase-csharp` SDK (PostgREST) — replaces EF Core
- **Auth:** Supabase Auth, validated by `JwtBearer` middleware against the Supabase JWKS (PF-S08, live locally since 2026-10-14)
- **Testing:** xUnit, Moq, Playwright (E2E)

### Supabase Platform
- **Database:** PostgreSQL 17 + pgvector (vector storage for RAG)
- **Auth:** GoTrue (JWT tokens, OAuth providers)
- **Storage:** File buckets for bank statement uploads (`bank-statements/`)
- **Realtime:** WebSocket subscriptions for live AI processing status
- **Webhooks:** Database Webhooks trigger Python AI service on INSERT
- **Local dev:** Supabase CLI (`supabase start`) — Studio at `http://localhost:54323`

### Backend — AI Services (Python)
- **Runtime:** Python 3.12+
- **Framework:** FastAPI
- **AI SDK:** Gemini SDK (primary, `gemini-2.5-flash`), Anthropic SDK (alternate, `claude-sonnet-4-6`)
- **LLM Extraction:** Gemini JSON mode + Anthropic `tool_use` (both force structured output — no regex)
- **Document Parsing:** PyMuPDF for PDF text extraction (pre-processing before LLM, reduces token cost)
- **Vision:** LLM vision API for screenshot/image extraction via `POST /parse-image`
- **AI Orchestration:** Sprint 2+ — RAG, embeddings, agents (not yet built)

### Frontend
- **Framework:** React 18 + TypeScript
- **Styling:** Tailwind CSS
- **State:** React Query (TanStack Query) for server state
- **Supabase client:** `@supabase/supabase-js` for sign-in and session (PF-S09) and transaction Realtime; upload-status Realtime (PF-S12) is still planned

### Infrastructure
- **Containers:** Docker Compose (local dev), individual Dockerfiles per service
- **CI/CD:** GitHub Actions (`ci.yml` runs dotnet build/test, ESLint, tsc, Vitest, vite build, pytest and gitleaks on push and PR; e2e is not run in CI)
- **Monitoring:** Structured logging, OpenTelemetry → Alloy → Prometheus + Loki + Tempo → Grafana (LGTM stack)
- **Cloud Target:** Supabase Cloud (database + platform), Azure (API + AI service hosting)

For detailed docs (read on demand — not auto-imported):
- [docs/architecture/API-endpoints.md](docs/architecture/API-endpoints.md) — all REST endpoints with curl examples
- [docs/architecture/API-backend.md](docs/architecture/API-backend.md) — backend architecture details
- [docs/architecture/Front-End.md](docs/architecture/Front-End.md) — frontend architecture details
- [docs/SETUP.md](docs/SETUP.md) — Docker and local setup
- [docs/architecture/architecture-diagram.md](docs/architecture/architecture-diagram.md) — full architecture diagram + event flow
- [docs/architecture/supabase-migration.md](docs/architecture/supabase-migration.md) — Supabase migration phases and rationale
- [docs/design/bank-profiles-reference.md](docs/design/bank-profiles-reference.md) — bank profile YAML schemas
- [docs/design/validation-pipeline.md](docs/design/validation-pipeline.md) — validation pipeline + master schema
- [docs/sprint-plan.md](docs/sprint-plan.md) — Sprint 1-4 full breakdown
- [docs/reference/finance-domain/](docs/reference/finance-domain/) — formula library, Indonesian instrument mechanics, investment tax rates (with verification dates). The always-loaded invariants live in [.claude/rules/finance-domain.md](.claude/rules/finance-domain.md); domain judgment routes to `/cio`, `/risk-officer`, `/compliance`

## Project Layout

```
apps/
  frontend/                   # React 18 + Vite + TypeScript frontend
    src/
      api/                    # API client functions (plain fetch, no axios)
      components/             # Business components + ui/ (shadcn/ui primitives)
      pages/                  # Route views (Index, NotFound)
      types/                  # TypeScript interfaces
      hooks/, lib/, utils/, data/ # Hooks, utilities, mock data
    e2e/                      # Playwright E2E tests
    package.json              # Frontend dependencies
    vite.config.ts
    tsconfig*.json
    tailwind.config.ts
    playwright.config.ts
  api/                        # .NET 10 backend (Clean Architecture)
    src/PersonalFinance.Api/           # Controllers, middleware, Program.cs
    src/PersonalFinance.Application/   # CQRS commands/handlers, services, validators, DTOs
    src/PersonalFinance.Domain/        # Entities, domain events (zero external deps)
    src/PersonalFinance.Infrastructure/# Bank parsers, validation pipeline, external services
      Parsers/                         # IBankStatementParser implementations
        BcaCsvParser.cs                # Direct CSV parser for BCA (semantic-anchor + CsvTokenizer)
        NeoBankPdfParser.cs            # Direct PDF parser for NeoBank (PdfPig + regex)
        DefaultCsvParser.cs            # Fallback CSV parser (auto-delimiter, Indonesian decimals)
        LlmPdfParser.cs                # LLM-routed parser with bank-specific prompt dispatch (PF-128)
        BankIdentifier.cs              # IBankSignature Chain of Responsibility registry (PF-124)
        IBankSignature.cs              # Signature interface — replaces monolith IdentifyAsync
        CsvTokenizer.cs                # Low-level CSV token parser (quote/escape handling)
        CsvTransactionParser.cs        # Shared CSV column mapper
        BankKeys.cs                    # Bank-specific column name constants
        BankProbeContext.cs            # Detection context passed to IBankSignature implementations
        BankProbeContextFactory.cs     # Builds BankProbeContext from file bytes + extension
        TransactionTypeClassifier.cs   # Debit/Credit classifier heuristics
      External/
        LlmExtractionClient.cs         # Typed HttpClient → Python AI service /parse-pdf /parse-image
        LlmCategorizationClient.cs     # Typed HttpClient → Python AI service /categorize
        LlmSuggestionClient.cs         # Typed HttpClient → Python AI service /suggest-categories
        PortfolioReviewClient.cs       # Typed HttpClient → Python AI service /portfolio-review
        JourneyAdvisorClient.cs        # Typed HttpClient → Python AI service /journey/advise
        LlmExtractionException.cs      # Exception type for LLM failures (transient/non-transient)
      Supabase/
        DependencyInjection.cs         # AddSupabase() extension, registers Supabase.Client + StorageService
        StorageService.cs              # IFileStorageService impl — bank-statements/ bucket
    tests/PersonalFinance.Tests/       # xUnit + Moq tests (20+ test files across Commands/, Services/, Parsers/, Controllers/)
services/
  ai-service/                 # Python FastAPI AI service
    app/
      main.py                 # FastAPI app, 8 endpoints
      services/
        llm_parser.py         # Gemini/Anthropic structured output extraction
        pdf_extractor.py      # PyMuPDF text extraction (pre-LLM)
        categorizer.py        # LLM-powered transaction categorization
        merchant_suggester.py # Batch merchant → category suggestion
        portfolio_reviewer.py # Investment portfolio AI review
        journey_advisor.py    # Financial journey advice endpoint
      providers/
        base.py               # LlmProvider interface
        factory.py            # ProviderFactory
        gemini.py             # GeminiProvider (primary)
        anthropic.py          # AnthropicProvider (alternate)
      models.py               # Pydantic models matching master schema
      config.py               # Environment config, API keys
    evals/                      # LLM evaluation harness (PF-AI002)
      fixtures/                 # 20 anonymized bank statement test cases
      ground_truth/             # Expected JSON output per fixture
      results/                  # YYYYMMDD benchmark run outputs
      eval_extraction.py        # CLI benchmark runner (--provider gemini|anthropic --compare)
      scoring.py                # Row-level F1 + field-level accuracy metrics
    tests/
    Dockerfile
    pyproject.toml
```

## Quick Commands

- Start everything: `npm start` (Supabase, monitoring containers, then API + frontend + AI service). Skill: `docker-up`.
- Before a push: skill `ci-check` (all gates) or `ci-check quick` (tests + lint).
- Per-service commands, ports, environment variables, and migrations: [docs/SETUP.md](docs/SETUP.md). Variable names: `.env.example`.
- Key ports: frontend 8080 · API 7208 (`/health`) · AI service 8000 (`/health`) · Supabase Studio 54323 · Grafana 3000 (loopback-only, log in as `admin` / `GRAFANA_ADMIN_PASSWORD`). Compose supporting services (`db`, `ai-service`, monitoring stack) bind to `127.0.0.1` only; `api` and `frontend` stay on all interfaces.

## Key Patterns

### Backend (.NET 10)
- **Clean Architecture**: Domain (no deps) → Application → Infrastructure → Api
- **CQRS via MediatR**: Commands as `record` types implementing `IRequest<T>`, handlers in `Application/Commands/`
- **FluentValidation**: Validators in `Application/Validation/`, naming: `Create{Entity}CommandValidator`
- **Domain Events**: `INotification` classes in `Domain/Events/`, published via MediatR after write operations
- **Supabase data access**: All persistence via `supabase-csharp` SDK — `supabase.From<T>().Filter().Get()` / `.Insert()` / `.Update()` / `.Delete()`. No EF Core, no DbContext.
- **Entity model convention**: Entities in `Domain/Entities/` inherit `BaseModel` (Supabase.Postgrest.Models) and use `[Table]`, `[PrimaryKey]`, `[Column]` attributes with snake_case names matching the DB.
- **DI Registration**: Supabase client registered via `AddSupabase()` extension in `Infrastructure/Supabase/DependencyInjection.cs`, called from `Program.cs`
- **Hybrid Bank Parser Strategy**:
  - `IBankStatementParser` implementations for direct parsers (BCA CSV, NeoBank PDF, Default CSV) — synchronous, deterministic, zero LLM cost
  - Unrecognized PDFs routed to `LlmPdfParser` → `ILlmExtractionClient` → Python AI service `POST /parse-pdf`
  - Images bypass identifier, sent directly to Python AI service `POST /parse-image`
  - `IBankSignature` registry in `BankIdentifier.cs` — Chain of Responsibility pattern (PF-124). Each bank implements `IBankSignature`; `BankIdentifier` iterates the chain and returns the first match. Replaces monolith `IBankIdentifier.IdentifyAsync()`.
  - Superbank PDF uses bank-specific LLM prompt via dispatch map in `LlmPdfParser` (PF-128)
  - BCA CSV uses semantic-anchor detection via `CsvTokenizer` + `BankKeys` (PF-104)
  - Bank profile YAML config system not yet built (PF-045)
  - Event-driven webhook pipeline (Storage → Webhook → AI) not yet wired (PF-S11)
- **Validation Pipeline**: `ITransactionPipelineService` chains 5 stages: DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck. Runs on all parsed output.
- **Deduplication**: Three-tier — Tier 1 file-hash (`uploaded_files` table), Tier 2/3 composite UNIQUE index on `(date, amount_idr, description, account_name, flow, bank_running_balance)`.
- **Auth**: Sign-in is required (PF-S08/S09, done 2026-10-16). The API validates the Supabase JWT, requires an authenticated user by default, and talks to PostgREST with a per-request client carrying the caller's token, so owner RLS policies on `user_id` apply. Take the owner from `ICurrentUser`, never from the request body. Public signup is off; the single owner account holds all legacy rows.
- **AI chat and agents**: The browser calls only `/api/chat/*`. The API forwards to the AI service with the internal API key and a signed 60-second owner token, and the AI service reads as that user under RLS (PF-S15). Flags: `AiChat:Enabled`, `AiChat:AgentsEnabled`, `AI_CHAT_ENABLED`, `AI_AGENTS_ENABLED`, `VITE_AI_CHAT_ENABLED`. Runbook: [docs/runbooks/pf-s08-cashflow-pilot.md](docs/runbooks/pf-s08-cashflow-pilot.md).

### AI Service (Python FastAPI)
- **Trigger**: Called directly by the .NET API via typed HttpClients. Webhook-triggered event-driven pipeline planned in PF-S11 (not yet built).
- **Endpoints**: `GET /health`, `POST /parse` (text), `POST /parse-pdf` (multipart, optional password), `POST /parse-image` (multipart, 10 MB cap), `POST /categorize` (single-transaction LLM categorization), `POST /suggest-categories` (batch merchant → category), `POST /portfolio-review` (investment AI review), `POST /journey/advise` (journey advisor).
- **Structured Output**: Gemini uses JSON mode (`response_mime_type="application/json"`); Anthropic uses `tool_use` forced extraction. No regex parsing of free text.
- **Provider Abstraction**: `ProviderFactory.create(settings)` returns `GeminiProvider` (default) or `AnthropicProvider`. No supabase-py dependency — results returned to .NET API as JSON.
- **Observability**: OpenTelemetry tracing + metrics via OTLP; `FastAPIInstrumentor` auto-wraps all routes. Langfuse tracing wired into `GeminiProvider` and `AnthropicProvider` — cost, latency, and token counts per LLM call visible in Langfuse dashboard (PF-AI001).
- **Pre-processing**: PDF text extracted via PyMuPDF (`fitz`) before LLM call. Screenshots/images sent to LLM vision directly as base64.
- **Pydantic Models**: Pydantic v2 throughout (`ConfigDict`, `str_strip_whitespace=True`). Response models match the `TransactionDto` contract (see `.claude/rules/ai-service.md`).
- **Async**: All FastAPI endpoints and LLM calls are async.

### Frontend (React/TypeScript)
- **UI look**: see [ai/design/](ai/design/README.md) — the zen/theme skills plus Rikky's standing UI rules. Skip only if the user asks for a different style (landing page, marketing, creative).
- **Code conventions**: [.claude/rules/frontend.md](.claude/rules/frontend.md) (path alias, shadcn/ui, fetch clients, React Query, Tailwind, forms, charts, routing).

## Testing

### E2E — Playwright (primary functional coverage)
- **Config:** `playwright.config.ts` — `baseURL: http://localhost:8080`, Chromium, auto-starts `npm run dev`
- **Tests:** `e2e/` — `health.spec.ts`, `dashboard.spec.ts`, `upload.spec.ts`, `category-rules.spec.ts`, `deduplication.spec.ts`
- **Fixtures:** `e2e/fixtures/bca-sample.csv` — sample BCA CSV for upload tests

| Command | What |
|---------|------|
| `npm run e2e` | Run all E2E tests (headless) |
| `npm run e2e:ui` | Open Playwright UI mode (interactive) |
| `npx playwright test e2e/health.spec.ts` | Run a single spec |
| `npx playwright codegen http://localhost:8080` | Record new tests interactively |
| `npx playwright show-report` | Open last HTML report |

**Requires full stack running.** Either `docker compose up -d` (DB + API) or local `dotnet run` + `npm run dev`.

### Backend and AI service
- Backend: xUnit + Moq conventions in [.claude/rules/backend.md](.claude/rules/backend.md). Many `CategoryRuleService` tests are `[Fact(Skip=...)]` — they pass but execute nothing (integration harness: PF-034).
- AI service: `pytest` from `services/ai-service/`; always mock LLM calls ([.claude/rules/ai-service.md](.claude/rules/ai-service.md)).
- Frontend unit tests: Vitest not yet configured (PF-038).

## Known Gotchas

- `src/types/Transaction.ts` uses `id: string` but API returns `id: number` — type mismatch
- Frontend tests are limited to Desk and Macro unit tests plus Playwright specs
- `apps/frontend/.env` must point `VITE_API_URL` at `http://localhost:7208`; `npm start` serves no HTTPS port, so `https://localhost:7209` makes every page fail to reach the API
- AI chat totals still travel as JSON numbers, not decimals (FIN-01 follow-up from PF-S15)

## File Protection

- NEVER commit `.env` files with real credentials
- NEVER commit API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY) — use environment variables
- NEVER modify files in `src/components/ui/` (managed by `npx shadcn@latest add`)
- Schema changes go in `supabase/migrations/` as numbered SQL files — apply via `supabase db push`
- Use `docker compose` (V2 syntax), never `docker-compose` (V1)
- NEVER use the Supabase `service_role` key on the frontend — it bypasses RLS entirely

## Task Management

Plans are managed in shared local files. GitHub Project #4 remains the source of truth for GitHub-linked issue status; local-only tasks use the plan folder and board:

- **Plans:** `plans/backlog/`, `plans/in-progress/`, `plans/done/`, and `plans/cancelled/` — one canonical plan per task; learning plans use each status folder's `learning/` subfolder. See `plans/README.md`.
- **Status board:** `plans/BOARD.md` — visual kanban overview; the block between `<!-- loop:begin -->` and `<!-- loop:end -->` is generated from the plan files and shows a plain-English Objectives column

### Creating a new task
Create a plan file in `plans/backlog/` (or `plans/backlog/learning/` for PF-AI) using `/plan`. Give it a `> **Board objective:** ...` header line (one plain-English sentence; see `plans/README.md`), then regenerate the board with `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write`. Do not hand-edit the generated block.

### Moving / closing a task
- Move the plan to its status folder and update its header, links, and board row together. `Ready` and `Blocked` are flags, not folders.
- When Done: move the plan and companions to `plans/done/` (or `plans/done/learning/`). Preserve historical notes and deferred follow-ups.

### Next task ID
Check `plans/BOARD.md`, all status folders, and any linked GitHub issues before allocating an ID. Use the existing PF-, PF-S, and PF-AI series; do not rely on a hardcoded next number.

---

## Project Status

Current phase, active features, known tech debt, and sprint references:
→ [docs/STATUS.md](docs/STATUS.md) — updated each sprint
