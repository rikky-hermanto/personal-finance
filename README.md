# Personal Finance Platform

An automated, cross-bank cashflow tracker for Indonesian bank accounts. Ingests CSV, PDF, and screenshot statements from 5 banks, extracts and normalizes transactions via a hybrid parser strategy (deterministic CSV parsing + LLM extraction for unstructured formats), and presents a unified multi-bank cashflow dashboard.

## 🚀 The Problem It Solves
Built to replace a painful monthly manual workflow: copy-pasting PDFs and screenshots into ChatGPT, cleaning output, then pasting into an ever-growing Excel sheet.

---

## Tech Stack at a Glance

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui (port 8080) |
| Backend API | .NET 10 / C# 13 + ASP.NET Core (Clean Arch, CQRS/MediatR) — port 7208 |
| Persistence | Supabase (PostgreSQL 17 + pgvector via supabase-csharp PostgREST) |
| AI Service | Python 3.12 + FastAPI — port 8000 |
| LLM Providers | Gemini 2.5 Flash (primary) · Claude Sonnet 4.6 (alternate) |
| Document Parsing | PyMuPDF (PDF text extraction pre-LLM) |
| Observability | OpenTelemetry → Alloy → Prometheus + Loki + Tempo → Grafana (port 3000) |
| Containers | Docker Compose V2 |
| CI | GitHub Actions (Claude code-review bot + PR review automation) |

---

## Architecture

```
Browser (React 18)
    │  fetch()
    ▼
.NET 10 API  ─────── POST /parse-pdf ──────► Python FastAPI AI Service
(CQRS/MediatR)       POST /parse-image        (Gemini / Anthropic)
    │                                              │
    │ supabase-csharp (PostgREST)                  │ (response: structured JSON)
    ▼                                              │
Supabase ◄─────────────────────────────────────────┘
├── PostgreSQL 17 (transactions, category_rules, uploaded_files)
├── Storage bucket  (bank-statements/)
└── pgvector        (RAG-ready, not yet wired)

Observability sidecar:
  .NET API + Python AI ──► OTLP ──► Alloy ──► Prometheus / Loki / Tempo ──► Grafana
```

---

## Feature Inventory

### Frontend (`apps/frontend/`, port 8080)

**App shell**
- `AppShell` — collapsible Sidebar + `<Outlet/>` main panel + right-rail `ActivityPanel` (last 8 transactions, stale-time: Infinity)
- Sidebar — Dashboard / Cashflow / Settings nav, "New Upload" CTA shortcut

**Dashboard (`/dashboard`)**
- Net Cashflow card (current-month income / expenses / net)
- Top Categories card with percentage bars and click-through drill-down
- Monthly Cashflow chart (composed bars + net line via Recharts)
- Portfolio and Debts sections (coming soon placeholder)

**Cashflow workspace (`/cashflow`, tabbed)**

| Tab | Route | What it shows |
|---|---|---|
| Overview | `/cashflow/overview` | Date-range selector (1M / 3M / 6M / 1Y / 2Y / YTD), Net Cashflow widget, Top Categories, composed cashflow chart |
| Transactions | `/cashflow/transactions` | Server-paged table (50/page, infinite scroll), Excel-style column filter menus with sort + checklist + date-range modes, global search, date sort, inline category edit, Export CSV button |
| Upload | `/cashflow/upload` | 4-step upload wizard (see below) |
| Statement | `/cashflow/statement` | Quarterly / monthly toggle, full Cash Flow Statement (Operating / Investing / Financing sections) with subtotals and `(parens)` negatives |

**Upload wizard (`/cashflow/upload`)**
- Accepts CSV, PDF, PNG, JPG, WebP via drag-drop, file picker, or **clipboard paste (Ctrl+V)**
- Bank-name hint dropdown for image uploads (BCA / Superbank / NeoBank / Wise / Jago)
- PDF password input with "no-password confirmation guard" — prompts user if they leave the field blank for a PDF (safeguards against forgotten passwords on encrypted statements)
- Download Template CSV button (generates blob locally, no server round-trip)
- **Two-table preview**: "Ready to Save" (new transactions) and "Duplicates" (already in DB) — inline-editable date, description, category, amount, bank
- Date format preference sent to backend (`pf_date_format` localStorage key)

**Settings (`/settings`, tabbed)**

| Tab | Route | What it does |
|---|---|---|
| Categories | `/settings/categories` | Full CRUD over 106 seeded category rules; keyword / type / category; longest-keyword-match note |
| Regional | `/settings/regional` | Date format select persisted to localStorage; currency/number-grouping (coming soon) |
| Data | `/settings/data` | Danger zone — type "DELETE ALL" to confirm wipe |

**Status page (`/status`)**
- Standalone page outside AppShell
- Polls `/health` every 30 s, shows live badge per service: Database, AI Service, Grafana, Frontend

**E2E test coverage (Playwright, `e2e/`)**
- `health.spec.ts` — backend health endpoint
- `dashboard.spec.ts` — sidebar nav, no console errors
- `upload.spec.ts` — BCA CSV full upload → submit (serial mode)
- `category-rules.spec.ts` — CRUD on `/settings/categories`
- `deduplication.spec.ts` — Tier 1 file-hash rejection + Tier 2/3 transaction-level dedup

---

### Backend API (`apps/api/`, port 7208)

**Architecture**
- Clean Architecture: `Domain` → `Application` → `Infrastructure` → `Api`
- CQRS via MediatR (commands, handlers, domain events, validators)
- Persistence via `supabase-csharp` (PostgREST) — no EF Core, no Persistence project
- Entities annotated with `[Table]`, `[PrimaryKey]`, `[Column]` (PostgREST model convention)

**REST Endpoints**

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/transactions/upload-preview` | Multi-format upload + parse (10 MB limit); routes images to AI service, PDFs to bank identifier |
| `POST` | `/api/transactions/upload-preview-new` | Storage-first flow; returns `processing_id` for PDFs/images; CSV processed inline |
| `POST` | `/api/transactions/submit` | Filter duplicates, bulk insert, register file hash |
| `GET` | `/api/transactions` | Paged + filtered list (wallet, category, type, search, sortOrder; pageSize 1–200) |
| `GET` | `/api/transactions/{id}` | Single transaction |
| `GET` | `/api/transactions/aggregated` | Dashboard aggregation (year / month / months / wallet) |
| `GET` | `/api/transactions/statement` | Cash Flow Statement (groupBy quarterly/monthly) |
| `GET` | `/api/transactions/export` | CSV export with date range |
| `DELETE` | `/api/transactions/reset` | Wipe transactions + uploaded_files |
| `GET` | `/api/categoryrules` | List all rules |
| `POST` | `/api/categoryrules` | Create rule |
| `PUT` | `/api/categoryrules/{id}` | Update rule |
| `DELETE` | `/api/categoryrules/{id}` | Delete rule |
| `GET` | `/health` | Multi-target health (DB + AI service + Grafana) via HealthChecks UI |

**Bank parsers — hybrid strategy**

| Parser | Bank | Format | Mode |
|---|---|---|---|
| `BcaCsvParser` | BCA | CSV (Indonesian headers) | Direct — deterministic column mapping |
| `NeoBankPdfParser` | NeoBank | PDF | Direct — PdfPig + regex (`dd MMM yyyy`) |
| `DefaultCsvParser` | Standard / master schema | CSV | Direct — auto-delimiter (`,` `;` `\t`), Indonesian decimals |
| `LlmPdfParser` | Any unrecognized PDF | PDF | LLM-routed — calls AI service `POST /parse-pdf` |
| _(inline)_ | Images (PNG/JPG/WebP) | Image | LLM vision — calls AI service `POST /parse-image` |

Bank identification via `BankIdentifier`: sniffs CSV headers for BCA / STANDARD; PDF text for `"NOW Savings"` → NeoBank; encrypted/unrecognized PDFs fall back to `LLM_PDF`.

**Deduplication (PF-090) — three-tier strategy**
- **Tier 1 — File hash**: `uploaded_files` table stores SHA of each submitted file; re-uploading the same file is rejected immediately
- **Tier 2/3 — Composite UNIQUE index**: `(date, amount_idr, description, wallet, flow, COALESCE(bank_running_balance, -999999999))` — covers intra-statement duplicates and cross-upload re-imports
- Service-layer tie-break: `BankRunningBalance` value used as secondary discriminator where amounts/dates collide

**Validation pipeline (5-stage, all parsers)**
`DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck`

**Categorization**
- 106 seeded category rules (`category_rules` table)
- Longest-keyword-match strategy; `CategorizeBatchAsync` preserves source-supplied categories and only fills blank/`"Untracked Expense"` rows

**Observability (PF-100)**
- OpenTelemetry tracing + metrics + structured logs via OTLP to `localhost:4317`
- Instrumentation: AspNetCore, HttpClient, Npgsql, Runtime
- Exception middleware records spans on `Activity.Current`; returns generic `ApiError` (detail in `#if DEBUG` only)

**Test coverage (`tests/PersonalFinance.Tests/`)**
- `DeduplicationTests` — 9 tests (intra-batch, DB matches, balance tie-break, normalization edges)
- `LlmExtractionClientTests` — PDF mapping, FX rates, 422/500/502 error handling
- `LlmPdfParserTests` — client/categorizer integration, password propagation
- `CategoryRuleServiceTests` — CRUD + `CategorizeBatchAsync` source-category preservation
- `DefaultCsvParserTests` — 12 tests (date formats, AM/PM, semicolon delimiter, Indonesian decimals)

---

### AI Service (`services/ai-service/`, port 8000)

**Endpoints**

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Service liveness |
| `POST` | `/parse` | Text body → structured transaction JSON |
| `POST` | `/parse-pdf` | Multipart PDF (optional `password`) → PyMuPDF text extract → LLM → JSON |
| `POST` | `/parse-image` | Multipart image (PNG/JPG/WebP, 10 MB cap) → LLM vision → JSON |

**Provider abstraction (`app/providers/`)**

| Provider | Model | When used |
|---|---|---|
| `GeminiProvider` | `gemini-2.5-flash` (default) | `AI_PROVIDER=gemini` (default) |
| `AnthropicProvider` | `claude-sonnet-4-6` | `AI_PROVIDER=anthropic`; uses `tool_use` forced extraction |

Single shared `SYSTEM_PROMPT` + JSON Schema (`EXTRACT_SCHEMA`) in `llm_parser.py`. `bank_hint` concatenated at request time. No per-bank prompt templates yet.

**Observability**: OTel tracing + metrics via `FastAPIInstrumentor`, `LoggingInstrumentor`, OTLP exporter.

**Test coverage (`tests/`)**: `test_health`, `test_parse`, `test_parse_pdf`, `test_pdf_extractor`

---

### Database (Supabase / PostgreSQL 17, port 54321 API)

**Tables**

| Table | Purpose |
|---|---|
| `transactions` | Master cashflow — all normalized transactions across all banks |
| `category_rules` | 106 keyword-based categorization rules |
| `uploaded_files` | File-hash dedup registry (Tier 1) |

**Supabase features in use**
- PostgreSQL 17 with `pgvector` extension (RAG-ready, not yet queried)
- Storage bucket `bank-statements/` (private, per-user folder layout)
- RLS enabled on all tables (permissive `USING (true)` placeholder — real policies come in PF-S08)
- 5 migration files in `supabase/migrations/`

---

### Observability — LGTM Stack (PF-100)

Started via `npm start` alongside all other services.

| Service | Port | Purpose |
|---|---|---|
| Alloy | 4317 (gRPC) / 4318 (HTTP) | OTLP collector |
| Prometheus | 9090 | Metrics |
| Loki | 3100 | Logs |
| Tempo | 3200 | Traces |
| Grafana | 3000 | Dashboard UI |

---

## Quick Start

### Prerequisites

- Docker Desktop (running)
- Node.js 20+
- .NET 10 SDK
- Python 3.12+
- Supabase CLI (`npm install -g supabase` or via Scoop/Homebrew)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env — add GEMINI_API_KEY (or ANTHROPIC_API_KEY), Supabase keys
cp services/ai-service/.env.example services/ai-service/.env
# Edit ai-service/.env — add AI_PROVIDER and matching API key
```

### 2. Start everything

```bash
npm start
```

This single command:
1. Starts Supabase local stack (PostgreSQL 17, Studio, Storage)
2. Starts LGTM observability containers (Alloy, Prometheus, Loki, Tempo, Grafana) and `db` Docker container
3. Starts `.NET 10 API` (`dotnet run`)
4. Starts Python AI service (`uvicorn`)
5. Starts React frontend (`vite`)

### 3. Open the app

| URL | What |
|---|---|
| http://localhost:8080 | Frontend |
| http://localhost:7208/health | Backend health |
| http://localhost:8000/health | AI service health |
| http://localhost:54323 | Supabase Studio |
| http://localhost:3000 | Grafana (admin / admin) |
| http://localhost:8080/status | Multi-service status dashboard |

### 4. Upload a statement

1. Go to **Cashflow → Upload**
2. Drag-drop or paste a CSV/PDF/image
3. Review the preview (Ready to Save / Duplicates tables), edit rows inline if needed
4. Click Submit

First run: use the **Download Template** button to get a CSV template matching the master cashflow schema.

---

## Project Layout

```
apps/
  frontend/                   # React 18 + Vite + TypeScript
    src/
      api/                    # Fetch clients (transactionsApi, categoryRulesApi, statusApi)
      components/             # Business components + ui/ (shadcn — DO NOT EDIT)
      pages/                  # Route views (Index redirect, NotFound, StatusPage)
      types/                  # TypeScript interfaces (Transaction, Dashboard, CashflowStatement)
      hooks/                  # useIsMobile, use-toast
      lib/                    # cn(), format helpers
      utils/                  # transactionParser (legacy, unused by cashflow flow)
    e2e/                      # Playwright E2E specs + fixtures
  api/                        # .NET 10 backend
    src/PersonalFinance.Api/           # Controllers, middleware, Program.cs
    src/PersonalFinance.Application/   # CQRS commands/handlers, services, validators, DTOs
    src/PersonalFinance.Domain/        # Entities, domain events (zero external deps)
    src/PersonalFinance.Infrastructure/# Bank parsers, validation pipeline, Supabase DI, LLM client
    tests/PersonalFinance.Tests/       # xUnit + Moq unit tests
services/
  ai-service/                 # Python 3.12 FastAPI
    app/
      main.py                 # FastAPI app, all endpoints, lifespan
      models.py               # Pydantic models (TransactionResult, ParseResponse, etc.)
      config.py               # Settings (Pydantic BaseSettings, .env)
      services/
        llm_parser.py         # LlmParser — SYSTEM_PROMPT, EXTRACT_SCHEMA, parse/parse_image
        pdf_extractor.py      # PdfExtractor — PyMuPDF, password-protected PDF handling
      providers/
        base.py               # LlmProvider Protocol
        factory.py            # ProviderFactory.create(settings)
        gemini.py             # GeminiProvider (primary)
        anthropic.py          # AnthropicProvider (alternate, tool_use)
    tests/
supabase/
  migrations/                 # 5 numbered SQL migration files
  config.toml                 # project_id, port config, Postgres 17
docs/                         # Architecture diagrams, sprint plans, bank profiles reference, setup guide
.claude/
  rules/                      # 5 rule files (ai-service, backend, frontend, docker, governance)
  skills/                     # 9 project skills + 2 theme skills
.kanban/
  BOARD.md                    # Claude-readable snapshot of GitHub Project #4
.github/
  workflows/                  # claude.yml (mention bot), claude-code-review.yml (auto PR review)
scripts/
  prestart.ps1                # Boots Docker Desktop, frees API port
  test-parse-pdf.ps1          # Manual AI service smoke test
package.json                  # Root orchestrator — `npm start` starts everything
docker-compose.yml            # api, ai-service, frontend, db, alloy, prometheus, loki, tempo, grafana
```

---

## Roadmap

Full sprint plan and Supabase migration phases: [docs/supabase-migration.md](docs/supabase-migration.md)
Task board: [GitHub Project #4](https://github.com/users/rikky-hermanto/projects/4)

**Next up (Supabase phases 3–6):**
- **PF-S08** — Supabase Auth: JWT middleware + user_id columns + real RLS policies
- **PF-S09** — Frontend Auth: Supabase login/signup + JWT forwarding
- **PF-S10** — Supabase Storage: StorageService already wired; wire remaining upload endpoint
- **PF-S11** — Event-driven AI pipeline: Supabase Database Webhook → Python `/webhooks/process`
- **PF-S12** — Supabase Realtime: live AI processing status in React
- **PF-S13** — RAG pipeline: pgvector embeddings + natural language transaction querying

**Other backlog highlights:**
- Wise CSV parser + FX rate conversion (PF-043)
- Bank profile YAML config system (PF-045)
- Backend test suites: handlers/validators (PF-034), parsers (PF-035), TransactionService (PF-036), controllers (PF-037)
- TypeScript strict mode (PF-052)
- ILogger everywhere (PF-051)
