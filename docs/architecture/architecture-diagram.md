# Architecture Diagram

Full-stack monorepo: React 18 + Vite frontend (`apps/frontend/`), .NET 10 Clean Architecture API (`apps/api/`), Python FastAPI AI service (`services/ai-service/`), all backed by **Supabase** (PostgreSQL 17 + pgvector, Auth, Storage, Realtime, Webhooks).

→ Migration rationale and phase breakdown: [docs/architecture/supabase-migration.md](supabase-migration.md)

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React 18 Frontend                           │
│  ┌──────────────────┐    ┌────────────────────────────────────┐ │
│  │ @supabase/js     │    │ REST calls via fetch()             │ │
│  │  - Auth (login)  │    │  - CRUD, upload, dashboard, etc.  │ │
│  │  - Realtime sub  │    │  - Bearer token from Supabase Auth │ │
│  └────────┬─────────┘    └───────────────┬────────────────────┘ │
└───────────┼──────────────────────────────┼──────────────────────┘
            │ direct                       │ via .NET API
            ▼                              ▼
┌───────────────────────┐   ┌──────────────────────────────────────┐
│   Supabase Platform   │   │        .NET 10 Web API (C#)          │
│                       │   │  Controllers → MediatR (CQRS)        │
│  Auth (GoTrue/JWT)    │   │  FluentValidation                    │
│  Storage (buckets)  ◄─┼───┤  Infrastructure:                     │
│  Realtime (WS)        │   │   - supabase-csharp (PostgREST)      │
│  Database Webhooks ───┼─┐ │   - StorageService (Supabase Storage)│
│                       │ │ │   - CSV Parsers (BCA, Wise, Default) │
│  ┌─────────────────┐  │ │ │   - Validation Pipeline              │
│  │ PostgreSQL 17   │  │ │ └──────────────────────────────────────┘
│  │ + pgvector      │  │ │
│  │ (see table list │  │ │       Webhook POST on INSERT
│  │  below)         │  │ │         to statement_uploads
│  │                 │  │ │
│  │ (RLS: permissive│  │ │  ┌──────────────────────────────────┐
│  │  until PF-S08)  │◄─┼──────┤  Python AI Service (FastAPI)     │
│  └─────────────────┘  │ └──►│  1. Download from Storage      │
│                       │      │  2. PyMuPDF / Claude Vision    │
└───────────────────────┘      │  3. Gemini/Claude extraction   │
                               │  4. Write results to DB        │
                               │  5. Update status → "done"     │
                               └────────────────────────────────┘
```

**In-progress wiring:**
- `@supabase/js` Auth → PF-S08 (next)
- Database Webhook → AI service event-driven pipeline → PF-S11
- Realtime status subscriptions → PF-S12
- RLS per-user enforcement (currently `USING (true)` placeholder) → PF-S08

```
  .NET 10 API  ──┐
                 │  OTLP (traces · metrics · logs)
  Python AI   ───┼──► Alloy (collector)
                 │         │
                 │    ┌────┼────────┐
                 │    ▼    ▼        ▼
                 │  Prometheus    Loki     Tempo
                 │    └────────────┬────────┘
                 │                 ▼
                 └──────────► Grafana :3000
```

---

## Database Tables (PostgreSQL 17)

### Cashflow

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `transactions` | All transaction records across all accounts | `date`, `description`, `amount_idr`, `flow` (DB/CR), `type`, `category`, `account_id`, `currency`, `exchange_rate`, `bank_running_balance` |
| `category_rules` | User-defined keyword → category mapping | `keyword`, `type`, `category`, `keyword_length` |
| `category_presets` | System-level category presets (read-only seed) | `keyword`, `category`, `type`, `flow`, `version` |
| `uploaded_files` | File-hash registry — Tier 1 deduplication | `file_hash` (UNIQUE), `file_name` |
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

**Current behavior (PF-S11 not yet built):** .NET API calls Python AI service synchronously via typed `HttpClient`. Result returned directly in the HTTP response.

**Target behavior (PF-S11 + PF-S12):**

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
