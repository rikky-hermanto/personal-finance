# Architecture Diagram

Full-stack monorepo: React 18 + Vite frontend (`apps/frontend/`), .NET 10 Clean Architecture API (`apps/api/`), Python FastAPI AI service (`services/ai-service/`), all backed by **Supabase** (PostgreSQL 17 + pgvector, Auth, Storage, Realtime, Webhooks).

→ Migration rationale and phase breakdown: [docs/architecture/supabase-migration.md](supabase-migration.md)

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND  ·  React 18 + TypeScript + Vite  ·  Tailwind CSS + shadcn/ui             │
│                                                                                       │
│  ┌───────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────┐     │
│  │ /journey  │  │ /cashflow  │  │ /assets  │  │/investment │  │  /settings   │     │
│  │ 5-tier    │  │ Upload     │  │ Net Worth│  │ IDX · MF   │  │  Categories  │     │
│  │ pyramid   │  │ Txns · Ana │  │ Balance  │  │ Bond · Cry │  │  Banks · UX  │     │
│  └───────────┘  └────────────┘  └──────────┘  └────────────┘  └──────────────┘     │
│                                                                                       │
│  React Query · react-hook-form + Zod · Recharts · lucide-react                      │
│  @supabase/js Auth [🚧 PF-S09]              @supabase/js Realtime [🚧 PF-S12]      │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                       │ REST fetch() · JWT Bearer [🚧 PF-S08]
┌──────────────────────────────────────▼───────────────────────────────────────────────┐
│  API  ·  .NET 10  ·  ASP.NET Core  ·  Clean Architecture (CQRS via MediatR)         │
│                                                                                       │
│  Controllers (7) ──► MediatR Commands/Handlers ──► supabase-csharp (PostgREST)      │
│                       FluentValidation · Domain Events · JourneyScoringService       │
│                                                   │                                  │
│  Parser Registry (IBankSignature CoR)             │ Typed HttpClients                │
│  BCA CSV · NeoBank PDF · Superbank PDF (prompt)   └──► LlmExtractionClient         │
│  Default CSV · LlmPdfParser · Image                     LlmCategorizationClient     │
│  → DateNorm → DecimalFix → CurrencyStd → Schema → Dedup  PortfolioReviewClient     │
└────────────────────────────────────┬──────────────────────────────────┬──────────────┘
                                     │ supabase-csharp (PostgREST)      │ HTTP sync
                                     │                    🚧 Webhook (PF-S11) future
              ┌──────────────────────▼───────────────┐ ┌────────────────▼─────────────┐
              │  DATA LAYER  ·  Supabase              │ │  AI SERVICE  ·  Python 3.12  │
              │                                       │ │  FastAPI · Pydantic v2       │
              │  PostgreSQL 17 + pgvector             │ │                              │
              │  ┌────────────────────────────────┐   │ │  Ingestion                   │
              │  │ Cashflow tables          (5)   │   │ │  PyMuPDF · LLM Vision        │
              │  │ Financial structure      (8)   │   │ │  Bank-specific prompt        │
              │  │ Investment portfolio     (3)   │   │ │  dispatch                    │
              │  │ Journey scoring          (3)   │   │ │                              │
              │  └────────────────────────────────┘   │ │  LLM Providers               │
              │                                       │ │  Gemini 2.5 Flash ← primary ✅│
              │  Auth (GoTrue)     🚧 PF-S08         │ │  Claude Sonnet 4.6 ← alt  ✅ │
              │  Storage: bank-statements/            │ │  Structured output only      │
              │  Realtime (WS)     🚧 PF-S12         │ │  (JSON mode / tool_use)      │
              │  DB Webhooks → AI  🚧 PF-S11         │ │                              │
              │  RLS placeholder   🚧 PF-S08         │ │  4-layer categorization ✅   │
              └───────────────────────────────────────┘ │  rule→presets→cache→LLM    │
                                                         │                              │
                                                         │  RAG Pipeline  🔄 PF-AI003 │
                                                         │  embed · pgvector · /search │
                                                         └──────────────────────────────┘

╔════════════════════════════════════════════════════════════════════════════════════════╗
║  OBSERVABILITY  ·  cross-cutting                                                      ║
║                                                                                        ║
║  System Telemetry (LGTM)  ✅ PF-100            AI Tracing (Langfuse)  ✅ PF-AI001   ║
║  OTel (.NET API + Python AI service)            Cost/day · Calls/day                  ║
║    → Alloy → Prometheus  (metrics)              Latency p50/p95 · Error rate          ║
║           → Loki         (logs)                 Per-call: provider · model · tokens   ║
║           → Tempo        (traces)                                                      ║
║           → Grafana :3000                       LLM Eval Harness  ✅ PF-AI002         ║
║                                                 20 fixtures · row F1 + field accuracy  ║
║  Status Page  ✅ PF-101  (/status)              services/ai-service/evals/            ║
╚════════════════════════════════════════════════════════════════════════════════════════╝
```

**Wiring status:**
| Component | Status | Ticket |
|-----------|--------|--------|
| `@supabase/js` Auth client | 🚧 Not yet | PF-S08/S09 |
| Supabase Auth JWT middleware (.NET) | 🚧 Not yet | PF-S08 |
| Database Webhook → AI service pipeline | 🚧 Not yet | PF-S11 |
| Realtime status subscriptions | 🚧 Not yet | PF-S12 |
| RLS per-user enforcement | 🚧 Not yet (placeholder `USING (true)`) | PF-S08 |
| RAG Phase 1 (`/embed-transactions` + `/search`) | 🔄 In progress | PF-AI003 |
| RAG Phase 2 (`/ask` endpoint) | 📋 Planned | PF-AI004 |

## AI Service Endpoints

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/health` | GET | ✅ Live | Health check |
| `/parse` | POST | ✅ Live | Extract transactions from raw text |
| `/parse-pdf` | POST | ✅ Live | Multipart PDF → transactions (PyMuPDF + LLM) |
| `/parse-image` | POST | ✅ Live | Screenshot/image → transactions (LLM vision, 10MB cap) |
| `/categorize` | POST | ✅ Live | Single-transaction LLM categorization |
| `/suggest-categories` | POST | ✅ Live | Batch merchant → category suggestion |
| `/portfolio-review` | POST | ✅ Live | AI investment portfolio review |
| `/journey/advise` | POST | ✅ Live | Financial journey advice |
| `/embed-transactions` | POST | 🔄 In progress | Embed transactions for semantic search (PF-AI003) |
| `/search` | POST | 🔄 In progress | Semantic transaction search via pgvector (PF-AI003) |
| `/ask` | POST | 📋 Planned | RAG Q&A endpoint (PF-AI004) |

---

## Database Tables (PostgreSQL 17)

### Cashflow

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `transactions` | All transaction records across all accounts | `date`, `description`, `amount_idr`, `flow` (DB/CR), `type`, `category`, `account_id`, `currency`, `exchange_rate`, `bank_running_balance` |
| `category_rules` | User-defined keyword → category mapping | `keyword`, `type`, `category`, `keyword_length` |
| `category_presets` | System-level category presets (read-only seed) | `keyword`, `category`, `type`, `flow`, `version` |
| `uploaded_files` | File-hash registry — Tier 1 deduplication | `file_hash` (UNIQUE), `file_name` |
| `statement_uploads` | Async processing job tracking — Tier 1 upload receipt | `file_hash`, `status` (pending/done/error), `processing_id`, `user_id` |
| `wallet_account_aliases` | Maps parser/AI wallet strings to `account_id` | `alias_text`, `account_id` |

### Financial Structure

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `institutions` | Banks, brokers, crypto exchanges | `name`, `type` (bank/broker/crypto_exchange/insurer), `country`, `logo_url` |
| `accounts` | Individual accounts at an institution | `name`, `account_type` (checking/savings/credit_card/brokerage/wallet/loan), `currency`, `opening_balance`, `opening_date`, `is_active` |
| `assets` | Non-fungible assets (property, vehicles, valuables) | `name`, `asset_class`, `account_id`, `acquisition_cost`, `valuation_strategy` |
| `holdings` | Fungible positions (MF units, stocks, crypto) | `account_id`, `ticker`, `quantity`, `cost_basis`, `currency` |
| `valuations` | Polymorphic time-series valuation for any subject | `subject_type` (account/asset/holding), `subject_id`, `value_idr`, `source`, `valued_at` |
| `liabilities` | Loans, mortgages, BNPL, revolving credit | `name`, `liability_type` (revolving/installment/personal), `principal`, `interest_rate`, `monthly_payment` |
| `fx_rates` | FX rate cache (JISDOR daily) | `currency_from`, `currency_to`, `rate`, `rate_date` |
| `price_quotes` | Market price feed placeholder for tickers | `ticker`, `price`, `currency`, `source`, `quoted_at` |

### Investment Portfolio

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `investment_setups` | Portfolio configuration (archetype, base currency) | `name`, `archetype_id`, `base_currency` |
| `investment_holdings` | Positions within a setup | `setup_id`, `ticker`, `name`, `asset_class`, `allocation_pct`, `quantity`, `avg_buy_price` |
| `investment_snapshots` | AI review snapshots | `setup_id`, `snapshot_date`, `total_value`, `ai_provider`, `ai_model`, `analysis_json` |

### Financial Journey

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `user_journey_state` | Current scoring snapshot per user | `current_level` (1–5), `total_score`, `level_scores` (JSONB), `indicator_scores` (JSONB) |
| `journey_indicator_snapshots` | Append-only daily score history per indicator | `snapshot_date`, `indicator_code`, `score`, `raw_value` |
| `journey_achievements` | Unlocked badges per user | `achievement_code`, `unlocked_at` |

### Views

| View | Purpose |
|------|---------|
| `v_transactions_with_balance` | `transactions` + `running_balance` (window function, partitioned by `account_id`, ordered by `date ASC, id ASC`) |

---

## Deduplication Strategy

Three-tier system ensures nothing gets imported twice:

| Tier | Mechanism | Table |
|------|-----------|-------|
| 1 | File-hash check — identical file rejected before parsing | `uploaded_files` |
| 2 | Composite UNIQUE index on `(date, amount_idr, description, account_id, flow, COALESCE(bank_running_balance, -999999999))` | `transactions` |
| 3 | `bank_running_balance` tie-break — differentiates legitimate same-day same-amount transactions via bank-reported balance | `transactions.bank_running_balance` |

---

## Event Flow: Upload → AI → Realtime

### ✅ Current behavior (live)

.NET API calls Python AI service **synchronously** via typed `HttpClient`. Result returned directly in the HTTP response. Works for all upload types (CSV, PDF, image).

### 🚧 Target behavior (PF-S11 + PF-S12 — not yet built)

```
User uploads PDF
       │
.NET API → Supabase Storage (bank-statements/{user_id}/{bank}/{file})
       │
.NET inserts into statement_uploads (status: "pending") → returns processing_id immediately
       │
Supabase Database Webhook fires on INSERT
       │
Python AI Service:
  a. Downloads file from Storage
  b. Extracts text via PyMuPDF (PDF) or sends image directly (screenshot)
  c. Gemini/Claude extracts transactions via structured output
  d. Writes transactions to Supabase DB
  e. Updates statement_uploads.status → "done"
       │
Supabase Realtime broadcasts status change → React auto-refreshes (no polling)
```

---

## Key Architecture Decisions

- **CSV banks stay synchronous in .NET** — BCA and Wise are deterministic column-mapped formats. Zero LLM cost, 100% accuracy, instant response.
- **PDF/image go to Python AI service** — LLM extraction (5–15 s) routed to FastAPI. Currently synchronous HTTP; will become async webhook-triggered (PF-S11).
- **supabase-csharp replaces EF Core** — All persistence via PostgREST fluent API. No DbContext, no `dotnet ef`. Schema = SQL migrations in `supabase/migrations/`.
- **Gemini primary, Claude alternate** — `gemini-2.5-flash` is the default LLM for extraction and categorization. Claude Sonnet 4.6 available as alternate via `AI_PROVIDER=anthropic` env var.
- **Structured output only** — Gemini JSON mode or Claude `tool_use` forced extraction. No regex parsing of free-text LLM responses.
- **Validation pipeline on all parsed output** — DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck runs on every upload path regardless of source parser.
- **`accounts` as the central FK** — `transactions.account_id` replaced `wallet` text column (PF-S18). `wallet_account_aliases` maps legacy parser strings → account UUIDs.
- **RLS permissive until PF-S08** — All tables use `USING (true)` placeholder. Real per-user isolation via `auth.uid()` wired alongside Supabase Auth in PF-S08.
- **IBankSignature Chain of Responsibility registry** — `BankIdentifier` iterates a chain of `IBankSignature` implementations; first match wins. Adding a new bank = new `IBankSignature` class, no modification of existing code. Replaced the monolith `IdentifyAsync()` in PF-124.
- **4-layer categorization** — Rule-match (106 rules) → category presets → history cache → LLM fallback. Cold-start safe via `CategoryPresetService` seed data. Avoids LLM calls for known merchants (PF-103).
- **Langfuse AI observability** — `GeminiProvider` and `AnthropicProvider` are instrumented with the Langfuse SDK. Cost, latency (p50/p95), token counts, and error rate per LLM call visible in Langfuse Cloud dashboard. Wired in PF-AI001.
