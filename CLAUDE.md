# Personal Finance — Claude Code Guide

## Project Overview

Personal Finance is a full-stack web application built with .NET 10 and React 18, designed to help users manage their personal finances. The application features a modern, responsive user interface, a robust backend API, and AI-powered features for transaction extraction, categorization, and insights. The project is containerized using Docker Compose for easy local development and deployment.

## Background Problem

### Managing Cashflow

The owner manages 5 Indonesian bank accounts that each produce monthly statements in different formats. Currently this is a painful manual workflow:

```
INPUT (5 sources, 3 format types)
├── BCA        → CSV        → column mapping          → Master Cashflow
├── Superbank  → PDF        → LLM extract → validate  → Master Cashflow
├── NeoBank    → PDF        → LLM extract → validate  → Master Cashflow
├── Wise       → CSV        → mapping + FX conversion  → Master Cashflow
└── Bank Jago  → Screenshot → LLM extract → validate  → Master Cashflow
```

**Pain points mapped to workflow:**

```
[Source Format Chaos]     [Manual Conversion]     [Manual Validation]     [Scale Problem]
     ▼                         ▼                        ▼                      ▼
  CSV / PDF / Screenshot → LLM copy-paste → Check format, fix dates → Excel bloating
     │                         │                  fix decimals, etc.        │
     │                         │                        │                   │
     └─── Repeats x5 banks ────┴──── Repeats monthly ───┴── Data grows ─────┘
```

**Two core goals:**
1. **Automate the process** — eliminate manual extraction, validation, and mapping
2. **Make it scalable** — replace Excel with PostgreSQL, adding a new bank = config file, not new code

### Solution: Hybrid Parser Architecture

The project uses a **hybrid parser strategy** — direct CSV parsing for structured sources, LLM extraction for unstructured sources (PDF, screenshots). This is the most efficient approach because:

- **CSV banks (BCA, Wise):** Deterministic column mapping. Zero LLM cost, 100% accuracy, fast. A per-bank config file defines column positions, date format, decimal convention.
- **PDF/image banks (Superbank, NeoBank, Bank Jago):** LLM-powered extraction using Gemini/Anthropic structured output (JSON mode or tool_use). The LLM extracts directly to the master schema — no intermediate "formatted CSV" step.

Both paths converge at a **validation pipeline** before persisting to PostgreSQL:

```
Upload → Bank Identifier → Route to parser
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
             Direct CSV Parser     LLM Extractor
             (BCA, Wise)           (Superbank, NeoBank, Jago)
                    │                    │
                    └─────────┬──────────┘
                              ▼
                    Validation Pipeline
                    (DateNormalizer → DecimalFixer →
                     CurrencyStandardizer → SchemaValidator →
                     DeduplicateCheck)
                              │
                              ▼
                    Master Cashflow Schema
                              │
                              ▼
                        PostgreSQL
```

### Bank Profiles

Each bank is defined by a configuration profile (JSON/YAML). Adding a new bank = adding a config file, not writing code.

| Bank | Format | Parser Strategy | Special Handling |
|------|--------|----------------|-----------------|
| BCA | CSV | Direct parser | Column mapping, DD/MM/YYYY dates |
| Superbank | PDF | LLM extraction | Multi-page statement, structured tables |
| NeoBank | PDF | LLM extraction | Colored/styled PDF, less structured |
| Wise | CSV | Direct parser | Multi-currency, FX rate conversion to IDR |
| Bank Jago | Screenshot | LLM extraction (vision) | Mobile app screenshots, OCR via vision API |

→ Full profile YAML examples and field schema: [docs/bank-profiles-reference.md](docs/bank-profiles-reference.md)

### Validation Pipeline

The validation layer runs on ALL parsed output regardless of source parser:

1. **DateNormalizer** — converts any date format to ISO 8601 (YYYY-MM-DD)
2. **DecimalFixer** — detects and normalizes decimal/thousands separators (Indonesian: 1.000.000,50 → 1000000.50)
3. **CurrencyStandardizer** — ensures consistent currency codes, handles Wise multi-currency → IDR conversion
4. **SchemaValidator** — validates against master cashflow schema (required fields, types, ranges)
5. **DeduplicateCheck** — detects duplicate transactions across uploads (same date + amount + description hash)

### Master Cashflow Schema

All banks converge to this unified schema before persisting. Key fields: `date` (ISO 8601), `description`, `amount_idr` (decimal), `currency` (ISO 4217), `type` (DEBIT|CREDIT), `bank_id`, `category`, `fx_rate?`.

→ Full schema definition and C# DTO details: [docs/validation-pipeline.md](docs/validation-pipeline.md)

## Architecture

React 18 frontend → .NET 10 API (supabase-csharp) → Supabase (PostgreSQL 17 + pgvector, Auth, Storage, Realtime, Webhooks). PDF/image uploads are event-driven: Storage upload → Database Webhook → Python FastAPI AI service → results written back to Supabase → Realtime notifies frontend.

→ Full architecture diagram and event flow: [docs/architecture-diagram.md](docs/architecture-diagram.md)
→ Supabase migration rationale and phases: [docs/supabase-migration.md](docs/supabase-migration.md)

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
- [docs/API-endpoints.md](docs/API-endpoints.md) — all REST endpoints with curl examples
- [docs/API-backend.md](docs/API-backend.md) — backend architecture details
- [docs/Front-End.md](docs/Front-End.md) — frontend architecture details
- [docs/SETUP.md](docs/SETUP.md) — Docker and local setup
- [docs/architecture-diagram.md](docs/architecture-diagram.md) — full architecture diagram + event flow
- [docs/supabase-migration.md](docs/supabase-migration.md) — Supabase migration phases and rationale
- [docs/bank-profiles-reference.md](docs/bank-profiles-reference.md) — bank profile YAML schemas
- [docs/validation-pipeline.md](docs/validation-pipeline.md) — validation pipeline + master schema
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
        BcaCsvParser.cs                # Direct CSV parser for BCA
        NeoBankPdfParser.cs            # Direct PDF parser for NeoBank (PdfPig + regex)
        DefaultCsvParser.cs            # Fallback CSV parser (auto-delimiter, Indonesian decimals)
        LlmPdfParser.cs                # LLM-routed parser for unrecognized PDFs
        BankIdentifier.cs              # Sniffs file content, returns bank code
        IBankIdentifier.cs             # ⚠ ARCH-02 violation — should be in Application/Interfaces/
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
  - `IBankIdentifier.IdentifyAsync()` detects bank from file content and returns parser key
  - Bank profile YAML config system not yet built (PF-045)
  - Event-driven webhook pipeline (Storage → Webhook → AI) not yet wired (PF-S11)
- **Validation Pipeline**: `ITransactionPipelineService` chains 5 stages: DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck. Runs on all parsed output.
- **Deduplication**: Three-tier — Tier 1 file-hash (`uploaded_files` table), Tier 2/3 composite UNIQUE index on `(date, amount_idr, description, wallet, flow, bank_running_balance)`.
- **Auth**: Not yet wired — API is wide open. Supabase Auth + JwtBearer middleware planned in PF-S08. RLS policies on tables use permissive `USING (true)` placeholder.

### AI Service (Python FastAPI)
- **Trigger**: Called directly by the .NET API via typed HttpClients. Webhook-triggered event-driven pipeline planned in PF-S11 (not yet built).
- **Endpoints**: `GET /health`, `POST /parse` (text), `POST /parse-pdf` (multipart, optional password), `POST /parse-image` (multipart, 10 MB cap), `POST /categorize` (single-transaction LLM categorization), `POST /suggest-categories` (batch merchant → category), `POST /portfolio-review` (investment AI review), `POST /journey/advise` (journey advisor).
- **Structured Output**: Gemini uses JSON mode (`response_mime_type="application/json"`); Anthropic uses `tool_use` forced extraction. No regex parsing of free text.
- **Provider Abstraction**: `ProviderFactory.create(settings)` returns `GeminiProvider` (default) or `AnthropicProvider`. No supabase-py dependency — results returned to .NET API as JSON.
- **Observability**: OpenTelemetry tracing + metrics via OTLP; `FastAPIInstrumentor` auto-wraps all routes.
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
Check the highest `[PF-XXX]` title in [GitHub Issues](https://github.com/rikky-hermanto/personal-finance/issues) and increment. Current highest: **PF-117** (Dashboard Overview UX Polish) → next is **PF-118**. New Supabase-specific tasks use the prefix **PF-S** (PF-S01 through PF-S13); next Supabase task is **PF-S14**.

---

## Current Phase

- **Setup phase (PF-001–PF-008):** COMPLETE
- **Cleanup sprint:** IN PROGRESS (8/18 done)
  - Done: PF-027, PF-028 (exception leaks), PF-029, PF-030, PF-031 (dashboard extraction), PF-032, PF-033, PF-041 (Playwright E2E)
  - Next: PF-051 (ILogger), PF-052 (TypeScript strict)
  - Backlog: PF-034–PF-038, PF-042, PF-043, PF-045
- **AI Ramp-Up:** COMPLETE — Python AI service live with Gemini/Anthropic
- **Observability:** COMPLETE — LGTM stack (PF-100) and Status Page (PF-101) live
- **Supabase Migration:** IN PROGRESS — 6 phases, tasks PF-S01–PF-S13
  - Done: PF-S01 through PF-S07 (EF Core removal)
  - See [docs/supabase-migration.md](docs/supabase-migration.md) for full phase breakdown
- **Feature expansion:** ACTIVE — Investment Portfolio, Spending Analysis (PF-108), Financial Journey Gamification, all shipped
  - **PF-114 COMPLETE** — Living Garden Hero redesign: LivingGardenHero.tsx + 5 plant SVG components + GroundBand + CloudAccent + dual-display indicators + journeyLabels.ts

### What's Working
- Full upload-preview-submit pipeline — BCA CSV, NeoBank PDF (direct parser), Default CSV, any unrecognized PDF (LLM-routed), PNG/JPG/WebP (LLM vision)
- 4-step upload wizard: drag-drop, file picker, clipboard paste, PDF password guard, two-table preview (Ready to Save / Duplicates), inline edit
- Python FastAPI AI service: `/parse`, `/parse-pdf`, `/parse-image` — Gemini (primary) and Anthropic (alternate)
- Robust three-tier deduplication: file-hash table + composite UNIQUE index + BankRunningBalance tie-break (PF-090)
- LGTM Observability stack (Alloy, Prometheus, Loki, Tempo, Grafana) with OTel instrumentation on .NET API + Python service (PF-100)
- System Health Status Dashboard at `/status` — polls every 30 s (PF-101)
- 106 seeded category rules with longest-keyword-match; `CategorizeBatchAsync` preserves source categories
- Cashflow workspace: Overview, Transactions (server-paged, Excel-style filters, CSV export), Upload, Statement (quarterly/monthly)
- Dashboard: Net Cashflow, Top Categories, Monthly chart
- Settings: Category CRUD, Regional (date format), Data (reset)
- Assets management: asset registry, liability tracking, live net worth calculation, balance sheet view
- Investment portfolio: stocks (IDX), mutual funds, government bonds, crypto, P2P; allocation breakdown + return tracking
- Spending analysis (PF-108): Safe-to-Spend indicator, variance explainer, monthly category drilldown
- Financial Journey gamification: 5-tier scoring system (Cashflow → Defense → Growth → Freedom → Legacy), quest cards, streak heatmap, `/journey` page
  - PF-114 COMPLETE: Living Garden Hero (5 animated plant SVGs replacing static pyramid hero, no-decay localStorage, dual-display indicator labels)
- Dark/light theme + zen-mode UX focus toggle (PF-106)
- Docker Compose full-stack orchestration
- GitHub Projects v2 board ([Project #4](https://github.com/users/rikky-hermanto/projects/4))
- Playwright E2E test infrastructure (`e2e/` with 5 spec files + BCA CSV fixture)

### What's Not Built Yet
- Auth (PF-S08 Supabase Auth)
- Event-driven AI pipeline (PF-S11 Supabase Database Webhook → Python AI)
- Realtime (PF-S12 live AI processing status)
- RAG pipeline, embeddings, natural language querying (PF-S13)
- Wise CSV parser (with FX rate conversion)
- Bank profile config system (YAML-driven)
- Budgeting, Bills & subscriptions, Savings & goals, Debt management, Reports & analytics, Unified dashboard, Personal tax

### Known Tech Debt
- TypeScript strict mode disabled (PF-052)
- Partial ILogger coverage (PF-051) — `TransactionsController` and `TransactionService` now use ILogger; `DashboardService`, `SpendingAnalysisService` still missing it
- Backend test coverage expanded (20+ files) but many core service tests are `[Fact(Skip="Requires Supabase integration")]` — PF-034 integration harness not yet built
- No frontend unit tests (PF-038)
- `src/types/Transaction.ts` uses `id: string` but API returns `id: number` — type mismatch
- `IBankIdentifier` interface in `Infrastructure/Parsers/IBankIdentifier.cs` — ARCH-02 violation (should be in `Application/Interfaces/`)
- `TransactionService.cs` missing `namespace` declaration — in global namespace, inconsistent with all other services
- `ex.Message` still leaks in `TransactionsController.upload-preview` general catch block (line 144) — PF-028 was closed but this specific catch was missed
- `upload-preview-new` experimental endpoint in `TransactionsController` is dead code — async Supabase Storage path never completes (returns 202 then nothing)

### Sprint Plan
→ Revised sprint plan interleaving AI + Supabase: [docs/supabase-migration.md](docs/supabase-migration.md)
→ Original Sprint 1-4 AI breakdown: [docs/sprint-plan.md](docs/sprint-plan.md)
