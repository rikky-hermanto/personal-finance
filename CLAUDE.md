# Personal Finance — Claude Code Guide

## Project Overview

Personal Finance is a full-stack web application built with .NET 10 and React 18, designed to help users manage their personal finances. The application features a modern, responsive user interface, a robust backend API, and AI-powered features for transaction extraction, categorization, and insights. The project is containerized using Docker Compose for easy local development and deployment.

## Background Problem

### The Real Problem: Clarity and Direction

Most people aren't financially illiterate — they're **directionally lost**. They earn, they spend, they occasionally invest, but without a coherent picture of where they stand or a framework for what to do next. Every financial tool answers a different slice of the question in isolation: a budgeting app here, a broker app there, a bank statement downloaded once a month that nobody reads. Plenty of data, no map.

The result: someone maxing out investments while carrying high-interest debt. Someone diligently saving without knowing whether their emergency fund is adequate. Good intentions, wrong order.

**This platform is built around the Financial Pyramid** — a five-tier hierarchy that makes the correct order explicit. Each level has prerequisites; you can't defend what you haven't built, and you can't grow what you haven't defended.

```
                 ▲
               ████             L5 · Legacy       — Estate planning, succession, tax
             ████████           L4 · Freedom      — FIRE, passive income
           ████████████         L3 · Growth       — Investing ≥15%, savings goals
         ████████████████       L2 · Defense      — Emergency fund, debt-to-income < 20%
       ████████████████████     L1 · Foundations  — Spending < income, bills paid
```

A `JourneyScoringService` reads across all data sources — transactions, assets, investments — and computes indicator scores per tier. Score recalculation is event-driven: `TransactionCreatedEvent` and asset mutations auto-trigger recalculation via MediatR domain event handlers. This scoring engine is the product's core, not a feature.

**Five modules feed the pyramid:**
- `/journey` — Home page. 5-tier scoring engine, quest cards, achievements, Living Garden Hero visualization.
- `/cashflow` — Transactions, upload (LLM + CSV hybrid parsing), spending analysis, Safe-to-Spend.
- `/assets` — Properties, vehicles, savings accounts, liabilities, live net worth balance sheet.
- `/investment` — IDX stocks, mutual funds, SBN/ORI bonds, crypto, P2P; AI portfolio review.
- `/settings` — Categories (106 rules), appearance, regional, banks, data reset.

### Data Infrastructure: Managing Cashflow

The owner manages 5 Indonesian bank accounts that each produce monthly statements in different formats. This is the data plumbing that keeps the pyramid scores grounded in reality — without accurate cashflow data, L1 scores are guesses.

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
- **Auth:** Supabase Auth (JWT validation via `JwtBearer` middleware — planned in PF-S08)
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
- **Supabase client:** `@supabase/supabase-js` — planned for PF-S09 (Auth) and PF-S12 (Realtime); not yet installed

### Infrastructure
- **Containers:** Docker Compose (local dev), individual Dockerfiles per service
- **CI/CD:** GitHub Actions
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

### Frontend
- Install: `cd apps/frontend && npm install`
- Dev server: `cd apps/frontend && npm run dev` (port 8080)
- Build: `cd apps/frontend && npm run build`
- Lint: `cd apps/frontend && npm run lint`

### Backend (.NET)
- Restore: `cd apps/api && dotnet restore PersonalFinance.slnx`
- Build: `cd apps/api && dotnet build PersonalFinance.slnx`
- Run API: `cd apps/api && dotnet run --project src/PersonalFinance.Api`
- Run tests: `cd apps/api && dotnet test`
- Single test: `cd apps/api && dotnet test --filter "FullyQualifiedName~TestMethodName"`

### Supabase (local dev)
- Start local stack: `supabase start` (Postgres, Auth, Storage, Realtime, Studio)
- Stop local stack: `supabase stop`
- Apply migrations: `supabase db push`
- Reset local DB: `supabase db reset`
- Open Studio: `http://localhost:54323`

### AI Service (Python)
- Setup: `cd services/ai-service && python -m venv .venv && source .venv/bin/activate && pip install -e .`
- Run: `cd services/ai-service && uvicorn app.main:app --reload --port 8000`
- Test: `cd services/ai-service && pytest`

### Start everything (recommended)
```
npm start
```
Starts Supabase (Docker), LGTM stack (Docker), .NET API, Python AI service, and frontend in one terminal with labeled output.

### Docker (full stack)
- **Fresh start (recommended):** `docker compose down && docker compose up --build`
  - Always run `down` first to remove stale containers (avoids container name conflicts)
- API + AI service only: `docker compose down && docker compose up --build api ai-service`
- Stop: `docker compose down`
- View logs: `docker compose logs -f api`
- Note: Supabase local stack is managed via `supabase start`, not Docker Compose

### Run everything locally (no Docker)
```
# Terminal 1 — Supabase local stack (replaces standalone postgres container)
supabase start

# Terminal 2 — .NET API
cd apps/api && dotnet run --project src/PersonalFinance.Api

# Terminal 3 — Python AI service
cd services/ai-service && uvicorn app.main:app --reload --port 8000

# Terminal 4 — Frontend
cd apps/frontend && npm run dev
```

## Ports & URLs

| Service           | Port  | URL                            | Start command         |
|-------------------|-------|--------------------------------|-----------------------|
| Frontend          | 8080  | http://localhost:8080           | `npm run dev`         |
| .NET API          | 7208  | http://localhost:7208           | `dotnet run` / Docker |
| AI Service        | 8000  | http://localhost:8000           | `uvicorn` / Docker    |
| Supabase API      | 54321 | http://localhost:54321          | `supabase start`      |
| Supabase Studio   | 54323 | http://localhost:54323          | `supabase start`      |
| Supabase Inbucket | 54324 | http://localhost:54324          | `supabase start`      |
| PostgreSQL        | 54322 | (Supabase-managed)             | `supabase start`      |
| Grafana           | 3000  | http://localhost:3000           | `npm start` / Docker  |
| Status Dashboard  | 8080  | http://localhost:8080/status    |                       |
| API health check  |       | http://localhost:7208/health    |                       |
| AI health check   |       | http://localhost:8000/health    |                       |

## Environment Variables

- Frontend: `VITE_API_URL` (default: `http://localhost:7208`) — set in `.env`
- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — planned for PF-S09 (Supabase Auth); not yet used
- Backend: `Supabase__Url` — Supabase project URL
- Backend: `Supabase__AnonKey` — Supabase anon key (client-context operations)
- Backend: `Supabase__ServiceRoleKey` — Supabase service role key (bypasses RLS for server ops)
- Backend: `AiService__BaseUrl` (default: `http://localhost:8000`) — Python AI service URL
- Backend: `ConnectionStrings__Default` — Postgres connection string (used by HealthChecks NpgSql)
- AI Service: `AI_PROVIDER` — `gemini` (default) or `anthropic`
- AI Service: `GEMINI_API_KEY` — Google Gemini API key (primary provider)
- AI Service: `AI_MODEL` — model override (default: `gemini-2.5-flash`)
- AI Service: `ANTHROPIC_API_KEY` — Claude API key (alternate provider)
- AI Service: `LOG_LEVEL` — logging level (default: `INFO`)
- AI Service: `OTEL_EXPORTER_OTLP_ENDPOINT` — OTLP endpoint for traces/metrics
- AI Service: `CORS_ORIGINS` — comma-separated allowed origins

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
- **Auth**: Not yet wired — API is wide open. Supabase Auth + JwtBearer middleware planned in PF-S08. RLS policies on tables use permissive `USING (true)` placeholder.

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
- **UI Theme**: Always apply `.claude/skills/data-oriented-theme/SKILL.md` when building any UI component, page, dashboard, or artifact — read it before starting any frontend work. Skip only if the user explicitly requests a different style (e.g., landing page, marketing, creative design).
- **Path alias**: `@/` maps to `./src` — always use it for imports
- **UI library**: shadcn/ui components in `src/components/ui/` — NEVER manually edit these files
- **API clients**: Plain `fetch` functions in `src/api/` — no axios
- **State**: React Query (`@tanstack/react-query`) for server state, `useState` for local state
- **Styling**: Tailwind CSS utility classes only, `cn()` from `@/lib/utils` for conditional merging
- **Forms**: react-hook-form + Zod for validation
- **Charts**: Recharts for data visualization
- **Routing**: react-router-dom v6, routes in `App.tsx`

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

### Backend — xUnit + Moq
- **Tests:** `api/tests/PersonalFinance.Tests/` — 20+ test files across `Commands/`, `Services/`, `Parsers/`, `Controllers/`
- **Pattern (post-EF Core removal):** Moq for Supabase-dependent services; pure logic tests for validators, parsers, dedup. `UseInMemoryDatabase` is **gone** — EF Core removed in PF-S07.
- **⚠ Note:** Many `CategoryRuleService` tests are `[Fact(Skip="Requires Supabase integration")]` — they pass in CI but execute no logic. Integration harness tracked in PF-034.
- **Run all:** `cd apps/api && dotnet test`
- **Single test:** `cd apps/api && dotnet test --filter "FullyQualifiedName~TestMethodName"`
- **Reference pattern:** `Commands/CreateAssetCommandHandlerTests.cs` — validator testing (no DB needed); `Services/DeduplicationTests.cs` — pure logic testing
- Naming: `MethodName_Condition_ExpectedResult`

### AI Service — pytest
- **Tests:** `ai-service/tests/`
- **Run:** `cd ai-service && pytest`
- **Mock LLM calls** in tests — never hit real API in CI

### Frontend unit tests — Vitest (not yet configured, PF-038)
- Will use Vitest + React Testing Library; tests alongside components as `*.test.tsx`

## Known Gotchas

- `src/types/Transaction.ts` uses `id: string` but API returns `id: number` — type mismatch
- No frontend tests exist yet
- No authentication — API is wide open

## File Protection

- NEVER commit `.env` files with real credentials
- NEVER commit API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY) — use environment variables
- NEVER modify files in `src/components/ui/` (managed by `npx shadcn@latest add`)
- Schema changes go in `supabase/migrations/` as numbered SQL files — apply via `supabase db push`
- Use `docker compose` (V2 syntax), never `docker-compose` (V1)
- NEVER use the Supabase `service_role` key on the frontend — it bypasses RLS entirely

## Task Management

Tasks are managed in **GitHub Projects v2** (hybrid approach):

- **Source of truth:** [GitHub Project #4](https://github.com/users/rikky-hermanto/projects/4) + [GitHub Issues](https://github.com/rikky-hermanto/personal-finance/issues)
- **Claude snapshot:** `.kanban/BOARD.md` — updated after every task operation so Claude can understand project state without hitting the GitHub API

### Creating a new task
```bash
gh issue create \
  --repo rikky-hermanto/personal-finance \
  --title "[PF-XXX] Task title" \
  --body "## Objective\n...\n\n## Acceptance Criteria\n- [ ] ..." \
  --label "feature,sprint:cleanup"
# Then add to project and set Status in GitHub UI or via GraphQL
```

### Moving / closing a task
- Update Status field in [Project #4](https://github.com/users/rikky-hermanto/projects/4)
- Close issue when Done: `gh issue close <number> --repo rikky-hermanto/personal-finance`
- **Always update `.kanban/BOARD.md`** to reflect the new state

### Next task ID
Check the highest `[PF-XXX]` title in [GitHub Issues](https://github.com/rikky-hermanto/personal-finance/issues) and increment. Current highest: **PF-128** (Superbank PDF Parser) → next is **PF-129**. New Supabase-specific tasks use the prefix **PF-S** (PF-S01 through PF-S13); next Supabase task is **PF-S14**. AI learning track tasks use prefix **PF-AI** (PF-AI001 complete, PF-AI002 complete, PF-AI003 in progress, PF-AI004 planned).

---

## Project Status

Current phase, active features, known tech debt, and sprint references:
→ [docs/STATUS.md](docs/STATUS.md) — updated each sprint
