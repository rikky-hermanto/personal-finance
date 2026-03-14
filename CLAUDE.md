# Personal Finance — Claude Code Guide

## Project Overview

Personal Finance is a full-stack web application built with .NET 9 and React 18, designed to help users manage their personal finances. The application features a modern, responsive user interface, a robust backend API, and AI-powered features for transaction extraction, categorization, and insights. The project is containerized using Docker Compose for easy local development and deployment.

## Background Problem

### Managing Cashflow

The owner manages 5 Indonesian bank accounts that each produce monthly statements in different formats. Currently this is a painful manual workflow:

```
INPUT (5 sources, 3 format types)
├── BCA        → CSV        → column mapping          → Master Cashflow
├── Superbank  → PDF        → GPT extract → validate  → Master Cashflow
├── NeoBank    → PDF        → GPT extract → validate  → Master Cashflow
├── Wise       → CSV        → mapping + FX conversion  → Master Cashflow
└── Bank Jago  → Screenshot → GPT extract → validate  → Master Cashflow
```

**Pain points mapped to workflow:**

```
[Source Format Chaos]     [Manual Conversion]     [Manual Validation]     [Scale Problem]
     ▼                         ▼                        ▼                      ▼
  CSV / PDF / Screenshot → GPT copy-paste → Check format, fix dates → Excel bloating
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
- **PDF/image banks (Superbank, NeoBank, Bank Jago):** LLM-powered extraction using Claude/GPT structured output (JSON mode or tool_use). The LLM extracts directly to the master schema — no intermediate "formatted CSV" step.

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

**Bank profile config example:**
```yaml
# bank-profiles/bca.yaml
bank_id: bca
display_name: "BCA"
format: csv
parser: direct_csv
date_format: "DD/MM/YYYY"
decimal_separator: ","
thousands_separator: "."
currency: "IDR"
column_mapping:
  date: 0
  description: 1
  debit: 3
  credit: 4
  balance: 5
```

```yaml
# bank-profiles/superbank.yaml
bank_id: superbank
display_name: "Superbank"
format: pdf
parser: llm_extraction
currency: "IDR"
llm_prompt_template: "superbank_pdf_v1"
extraction_model: "claude-sonnet"  # cost-efficient for extraction
```

### Validation Pipeline

The validation layer runs on ALL parsed output regardless of source parser. This is the component that eliminates the manual "check format, fix dates, fix decimals" pain:

1. **DateNormalizer** — converts any date format to ISO 8601 (YYYY-MM-DD)
2. **DecimalFixer** — detects and normalizes decimal/thousands separators (Indonesian convention: 1.000.000,50 → 1000000.50)
3. **CurrencyStandardizer** — ensures consistent currency codes, handles Wise multi-currency → IDR conversion
4. **SchemaValidator** — validates against master cashflow schema (required fields, types, ranges)
5. **DeduplicateCheck** — detects duplicate transactions across uploads (same date + amount + description hash)

### Master Cashflow Schema

All banks converge to this unified schema before persisting:

```
Transaction {
  date: Date           // ISO 8601
  description: string  // original bank description
  amount: decimal(18,4)// positive for credit, negative for debit
  currency: string     // ISO 4217 (IDR, USD, EUR, etc.)
  amount_idr: decimal  // converted amount in IDR (for Wise multi-currency)
  type: enum           // DEBIT | CREDIT
  bank_id: string      // references bank profile
  account_name: string // e.g. "Jago Main Pocket", "BCA Checking"
  category: string     // auto-categorized by LLM or rule-based
  raw_text: string     // original unparsed line (for audit/debugging)
  source_file: string  // original filename
  fx_rate: decimal?    // exchange rate used (Wise only)
}
```

## Architecture

Full-stack monorepo: React 18 + Vite frontend (`src/`) with .NET 9 Clean Architecture API (`api/`) and PostgreSQL 16, orchestrated via Docker Compose. Python AI service (FastAPI) handles LLM extraction for PDF/image bank statements.

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                       │
│              (TypeScript + Tailwind CSS)                │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│              .NET 9 Web API (C#)                        │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐  │
│  │ Accounts │ │ Transact │ │  Assets   │ │   Tax    │  │
│  │ Module   │ │ Module   │ │  Module   │ │  Module  │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────┘  │
│  ┌──────────────────────────────────────────────────┐   │
│  │ MediatR (CQRS) + FluentValidation                │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Bank Identifier + Direct CSV Parsers             │   │
│  │ → BCA parser, Wise parser (+ FX conversion)      │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Validation Pipeline                              │   │
│  │ → DateNorm → DecimalFix → CurrencyStd → Schema   │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │ (PDF/image uploads forwarded)         │
└─────────────────┼───────────────────────────────────────┘
                  │ Internal HTTP
┌─────────────────▼───────────────────────────────────────┐
│           Python AI Service (FastAPI)                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ LLM Extractor (PDF → structured JSON)            │   │
│  │ Vision Extractor (screenshot → structured JSON)  │   │
│  │ → Claude API (primary) / OpenAI (fallback)       │   │
│  │ → Structured output (JSON mode / tool_use)       │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐               │
│  │   RAG    │ │ Embeddings│ │ Categorizer│  (Sprint 2+) │
│  │ Pipeline │ │  Service  │ │  Service   │              │
│  └──────────┘ └──────────┘ └────────────┘               │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│              PostgreSQL 16 + pgvector                   │
│  ┌──────────────────┐  ┌─────────────────────────┐      │
│  │ Relational Data  │  │  Vector Embeddings      │      │
│  │ (EF Core)        │  │  (pgvector / cosine)    │      │
│  └──────────────────┘  └─────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### Key Architecture Decisions

- **CSV banks stay in .NET** — BCA and Wise parsers are deterministic, no LLM needed. They live in `Infrastructure/BankParsers/` as `IBankStatementParser` implementations. Zero latency, zero cost.
- **PDF/image banks go to Python** — Superbank, NeoBank, Bank Jago require LLM extraction. The .NET API forwards the file to the Python FastAPI service, which returns structured JSON matching the master schema.
- **Validation is shared** — Both parser paths feed into the same `ValidationPipeline` in .NET before persisting. This is the single source of truth for data quality.
- **LLM structured output, not free text** — The Python service uses Claude's `tool_use` or JSON mode to force structured output matching the master schema. No regex parsing of LLM output, no "formatted CSV" intermediate step.
- **Bank profiles as config** — Adding a new bank = adding a YAML config file + (if CSV) a parser class, or (if PDF/image) a prompt template. The bank identifier auto-detects which profile to use.

## Tech Stack

### Backend — Primary (.NET)
- **Runtime:** .NET 9
- **Language:** C# 13
- **API:** ASP.NET Core Web API (REST)
- **Patterns:** CQRS via MediatR, FluentValidation, Clean Architecture
- **ORM:** Entity Framework Core 9
- **Database:** PostgreSQL 16 + pgvector extension (vector storage for RAG)
- **Auth:** Auth0 (OAuth 2.0 / OIDC) — defer implementation until core features stable
- **Testing:** xUnit, Moq, Playwright (E2E)

### Backend — AI Services (Python)
- **Runtime:** Python 3.12+
- **Framework:** FastAPI
- **AI SDK:** Anthropic SDK (primary), OpenAI SDK (secondary/fallback)
- **LLM Extraction:** Claude structured output via `tool_use` (PDF/image → JSON)
- **Document Parsing:** PyMuPDF for PDF text extraction (pre-processing before LLM)
- **Vision:** Claude vision API for screenshot extraction (Bank Jago)
- **AI Orchestration:** LangChain (future Sprint 2+ — RAG, agents)

### Frontend
- **Framework:** React 18 + TypeScript
- **Styling:** Tailwind CSS
- **State:** React Query (TanStack Query) for server state

### Infrastructure
- **Containers:** Docker Compose (local dev), individual Dockerfiles per service
- **CI/CD:** GitHub Actions
- **Monitoring:** Structured logging (Serilog), OpenTelemetry-ready
- **Cloud Target:** Azure (primary), AWS (secondary option)

For detailed docs (read on demand — not auto-imported):
- [docs/API-endpoints.md](docs/API-endpoints.md) — all REST endpoints with curl examples
- [docs/API-backend.md](docs/API-backend.md) — backend architecture details
- [docs/Backend-AI.md](docs/Backend-AI.md) — AI services architecture details [TO BE UPDATED]
- [docs/Front-End.md](docs/Front-End.md) — frontend architecture details
- [docs/SETUP.md](docs/SETUP.md) — Docker and local setup

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
  api/                        # .NET 9 backend (Clean Architecture)
    src/PersonalFinance.Api/           # Controllers, middleware, Program.cs
    src/PersonalFinance.Application/   # CQRS commands/handlers, services, validators, DTOs
    src/PersonalFinance.Domain/        # Entities, domain events (zero external deps)
    src/PersonalFinance.Infrastructure/# Bank parsers, validation pipeline, external services
      BankParsers/                     # IBankStatementParser implementations
        BcaCsvParser.cs                # Direct CSV parser for BCA
        WiseCsvParser.cs               # Direct CSV parser for Wise (+ FX conversion)
        DefaultCsvParser.cs            # Fallback CSV parser
        LlmExtractionClient.cs        # HTTP client to Python AI service
      BankProfiles/                    # YAML/JSON bank config files
      Validation/                      # ValidationPipeline + individual validators
    src/PersonalFinance.Persistence/   # EF Core DbContext, migrations, DI registration
    tests/PersonalFinance.Tests/       # xUnit + Moq tests
services/
  ai-service/                 # Python FastAPI AI service
    app/
      main.py                 # FastAPI app, health check
      routers/
        extract.py            # POST /extract/pdf, POST /extract/image
      services/
        llm_extractor.py      # Claude/OpenAI structured output extraction
        pdf_text_extractor.py # PyMuPDF text extraction (pre-LLM)
      models/
        transaction.py        # Pydantic models matching master schema
      prompts/
        superbank_pdf_v1.py   # Bank-specific prompt templates
        neobank_pdf_v1.py
        bankjago_image_v1.py
      config/
        settings.py           # Environment config, API keys
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
- Add migration: `cd apps/api && dotnet ef migrations add <Name> --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api`
- Apply migration: `cd apps/api && dotnet ef database update --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api`

### AI Service (Python)
- Setup: `cd services/ai-service && python -m venv .venv && source .venv/bin/activate && pip install -e .`
- Run: `cd services/ai-service && uvicorn app.main:app --reload --port 8000`
- Test: `cd services/ai-service && pytest`

### Start everything (recommended)
```
npm start
```
Starts DB (Docker, detached), .NET API, and frontend in one terminal with labeled output. DB container is reused if already running — no rebuild.

### Docker (full stack)
- **Fresh start (recommended):** `docker compose down && docker compose up --build`
  - Always run `down` first to remove stale containers (avoids container name conflicts)
- DB + API only: `docker compose down && docker compose up --build db api`
- DB only: `docker compose up db`
- Stop: `docker compose down`
- Reset DB: `docker compose down -v`
- View logs: `docker compose logs -f api`

### Run everything locally (no Docker)
```
# Terminal 1 — DB only via Docker
docker compose up db

# Terminal 2 — .NET API
cd apps/api && dotnet run --project src/PersonalFinance.Api

# Terminal 3 — Python AI service
cd services/ai-service && uvicorn app.main:app --reload --port 8000

# Terminal 4 — Frontend
cd apps/frontend && npm run dev
```

## Ports & URLs

| Service      | Port | URL                         | Start command        |
|--------------|------|-----------------------------|----------------------|
| Frontend     | 8080 | http://localhost:8080        | `npm run dev`        |
| .NET API     | 7208 | http://localhost:7208        | `dotnet run` / Docker|
| AI Service   | 8000 | http://localhost:8000        | `uvicorn` / Docker   |
| PostgreSQL   | 5432 | personal_finance database   | Docker               |
| Health check |      | http://localhost:7208/health |                      |
| AI health    |      | http://localhost:8000/health |                      |

## Environment Variables

- Frontend: `VITE_API_URL` (default: `http://localhost:7208`) — set in `.env`
- Backend: `ConnectionStrings__Default` — PostgreSQL connection string in `appsettings.Development.json` or Docker env
- Backend: `AiService__BaseUrl` (default: `http://localhost:8000`) — Python AI service URL
- AI Service: `ANTHROPIC_API_KEY` — Claude API key (required for LLM extraction)
- AI Service: `OPENAI_API_KEY` — OpenAI API key (fallback provider, optional)

## Key Patterns

### Backend (.NET 9)
- **Clean Architecture**: Domain (no deps) → Application → Infrastructure/Persistence → Api
- **CQRS via MediatR**: Commands as `record` types implementing `IRequest<T>`, handlers in `Application/Commands/`
- **FluentValidation**: Validators in `Application/Validation/`, naming: `Create{Entity}CommandValidator`
- **Domain Events**: `INotification` classes in `Domain/Events/`, published via MediatR after `SaveChangesAsync`
- **Hybrid Bank Parser Strategy**:
  - `IBankStatementParser` implementations for CSV banks (BCA, Wise) — deterministic, zero LLM cost
  - `ILlmExtractionClient` for PDF/image banks — forwards to Python AI service
  - `IBankIdentifier.IdentifyAsync()` detects bank from file content and routes to correct parser
  - Bank profiles loaded from YAML config files in `Infrastructure/BankProfiles/`
- **Validation Pipeline**: `IValidationPipeline` chains validators: DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck. Runs on ALL parsed output regardless of source parser.
- **EF Core**: Snake_case naming via `UseSnakeCaseNamingConvention()`. Tables: `transactions`, `category_rules`, `bank_profiles`. Auto-migrate on startup in `Program.cs`
- **DI Registration**: Persistence uses `AddPersistence()` extension. Other services registered directly in `Program.cs`

### AI Service (Python FastAPI)
- **LLM Provider Abstraction**: `ILLMProvider` interface with `AnthropicProvider` (primary) and `OpenAIProvider` (fallback). Switch via config.
- **Structured Output**: All LLM extraction uses `tool_use` (Claude) or JSON mode (OpenAI) to force output matching Pydantic models. No regex parsing of free text.
- **Bank-Specific Prompts**: Each bank has a prompt template in `prompts/` that includes the bank's typical format, expected fields, and edge cases.
- **Pre-processing**: PDF text is extracted via PyMuPDF before sending to LLM (reduces token cost). For screenshots, the raw image is sent to Claude vision API.
- **Pydantic Models**: All request/response schemas use Pydantic v2. Response models match the master cashflow schema.
- **Async**: All FastAPI endpoints are async. LLM calls use async SDK methods.

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
- **Tests:** `e2e/` — `health.spec.ts`, `dashboard.spec.ts`, `upload.spec.ts`, `category-rules.spec.ts`
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
- **Tests:** `api/tests/PersonalFinance.Tests/` — `UseInMemoryDatabase` per test class, `IDisposable` pattern
- **Run all:** `cd api && dotnet test`
- **Single test:** `cd api && dotnet test --filter "FullyQualifiedName~TestMethodName"`
- **Reference:** `Services/CategoryRuleServiceTests.cs` — canonical example
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
- CORS is hardcoded to `http://localhost:8080` only (in `Program.cs`)
- DB credentials are in `appsettings.Development.json` (not secret-managed)
- Python AI service is NOT yet built — currently only .NET direct parsers work (BCA CSV, NeoBank PDF stub, Default CSV)

## File Protection

- NEVER commit `.env` files with real credentials
- NEVER commit API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY) — use environment variables
- NEVER modify files in `src/components/ui/` (managed by `npx shadcn@latest add`)
- NEVER manually edit migration `Designer.cs` or `Snapshot.cs` files
- ALWAYS use `dotnet ef migrations add` for schema changes
- Use `docker compose` (V2 syntax), never `docker-compose` (V1)

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
Check the highest `[PF-XXX]` title in [GitHub Issues](https://github.com/rikky-hermanto/personal-finance/issues) and increment. Current highest: **PF-042** → next is **PF-043**.

---

## Current Phase

> **Last updated:** 2026-03-13

### Status: Cleanup Sprint (4/7 core done) → Ramp-Up started

- **Setup phase (PF-001–PF-008):** COMPLETE
- **Cleanup sprint (PF-027–PF-033 + extras):** IN PROGRESS
  - Done: PF-027, PF-030, PF-032, PF-033, PF-041 (Playwright E2E)
  - Ready: PF-028 (exception leaks), PF-029 (N+1), PF-031 (controller logic)
  - Backlog: PF-034–PF-040, PF-042 (test suites, bugs, MCP exploration)
- **Ramp-Up:** PF-009 (Hello LLM) — IN PROGRESS

### What's Working
- Full upload-preview-submit pipeline (BCA CSV, NeoBank PDF, Default CSV)
- 106 seeded category rules with longest-keyword-match
- Dashboard with aggregated stats, top categories, 6-month cash flow
- Docker Compose full-stack orchestration
- GitHub Projects v2 board ([Project #4](https://github.com/users/rikky-hermanto/projects/4)) with all 42 tasks migrated
- Playwright E2E test infrastructure (PF-041 — `e2e/` with 4 spec files + BCA CSV fixture)

### What's Not Built Yet
- Python FastAPI AI service (ai-service/)
- LLM extraction for PDF/image banks (Superbank, NeoBank, Bank Jago)
- Wise CSV parser (with FX rate conversion)
- Bank profile config system (YAML-driven)
- Validation pipeline (DateNormalizer, DecimalFixer, CurrencyStandardizer, SchemaValidator, DeduplicateCheck)
- LLM integration (PF-009 in progress — first Anthropic API call)
- RAG pipeline, embeddings, natural language querying (Sprint 2+)
- Authentication

### Known Tech Debt (remaining)
- Application.csproj still references Persistence (Clean Arch violation — ARCH-01)
- N+1 queries in CategorizeAsync (PF-029)
- N+1 in SubmitTransactions: GetAllAsync() called per transaction (PF-039)
- ~100 lines business logic in controller (PF-031)
- Exception details leaked in HTTP 500 responses (PF-028)
- Dashboard cash flow ignores year/month query params (PF-040)
- TypeScript strict mode disabled
- Zero ILogger usage
- No backend handler/validator/parser/controller tests (PF-034–PF-037)
- No frontend tests (PF-038)

### Revised Sprint Plan (Hybrid Approach)

**Sprint 1 — Hybrid Parser Pipeline (Week 1-2)**
- Build Python FastAPI AI service skeleton (health check, extract endpoints)
- Implement LLM extraction for Superbank PDF using Claude structured output
- Implement LLM extraction for Bank Jago screenshot using Claude vision
- Build Wise CSV direct parser (with FX rate conversion logic)
- Build bank profile config system (YAML loader)
- Build validation pipeline (.NET side): DateNormalizer, DecimalFixer, CurrencyStandardizer, SchemaValidator, DeduplicateCheck
- Wire .NET → Python HTTP forwarding for PDF/image uploads
- Integration tests for full pipeline (upload → parse → validate → persist)

**Sprint 2 — RAG Pipeline (Week 3-4)**
- Embedding generation for transaction descriptions + metadata
- pgvector storage and similarity search
- Natural language query endpoint
- RAG pipeline: embed question → retrieve → LLM answer

**Sprint 3 — AI Agents (Week 5-6)**
- Function calling: .NET API endpoints as LLM tools
- Agent loop for multi-step operations
- Semantic Kernel integration on .NET side

**Sprint 4 — Production Hardening (Week 7-8)**
- AI observability: token usage, latency, cost per query
- Semantic caching for repeated queries
- Error recovery and retry logic for LLM calls
- Rate limiting, security, API key management
- Optional: n8n orchestration layer for scheduled monthly imports