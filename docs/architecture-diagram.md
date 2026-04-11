# Architecture Diagram

Full-stack monorepo: React 18 + Vite frontend (`apps/frontend/`), .NET 9 Clean Architecture API (`apps/api/`), Python FastAPI AI service (`services/ai-service/`), all backed by **Supabase** (PostgreSQL 16 + pgvector, Auth, Storage, Realtime, Webhooks).

→ Migration rationale and phase breakdown: [docs/supabase-migration.md](docs/supabase-migration.md)

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
│   Supabase Platform   │   │        .NET 9 Web API (C#)           │
│                       │   │  Controllers → MediatR (CQRS)        │
│  Auth (GoTrue/JWT)    │   │  FluentValidation                    │
│  Storage (buckets)  ◄─┼───┤  Infrastructure:                     │
│  Realtime (WS)        │   │   - supabase-csharp (PostgREST)      │
│  Database Webhooks ───┼─┐ │   - StorageService (Supabase Storage)│
│                       │ │ │   - CSV Parsers (BCA, Wise, Default) │
│  ┌─────────────────┐  │ │ │   - Validation Pipeline              │
│  │ PostgreSQL 16   │  │ │ └──────────────────────────────────────┘
│  │ + pgvector      │  │ │
│  │ transactions    │  │ │       Webhook POST on INSERT
│  │ category_rules  │  │ │         to statement_uploads
│  │ statement_      │  │ │
│  │   uploads       │  │ │  ┌──────────────────────────────────┐
│  │ embeddings      │  │ └──►  Python AI Service (FastAPI)     │
│  │ (RLS enforced)  │◄─┼──────┤  1. Download from Storage      │
│  └─────────────────┘  │      │  2. PyMuPDF / Claude Vision    │
│                       │      │  3. Claude tool_use extraction  │
└───────────────────────┘      │  4. Write results via supabase-py│
                               │  5. Update status → "done"     │
                               │                                │
                               │  RAG / Embeddings (Sprint 2+)  │
                               └────────────────────────────────┘
```

## Event Flow: Upload → AI → Realtime

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
  c. Claude API extracts transactions via tool_use
  d. Writes transactions to Supabase DB via supabase-py
  e. Updates statement_uploads.status → "done"
       │
Supabase Realtime broadcasts status change → React auto-refreshes (no polling)
```

## Key Architecture Decisions

- **CSV banks stay synchronous in .NET** — BCA and Wise are deterministic column-mapped formats. Zero LLM cost, 100% accuracy, instant response. No reason to make them async.
- **PDF/image banks go event-driven** — Superbank, NeoBank, Bank Jago require LLM extraction (5–15s). The upload returns a `processing_id` immediately; a Supabase Database Webhook triggers the Python AI service in the background.
- **Python AI service writes directly to Supabase** — After the webhook trigger, Python is autonomous. It downloads from Storage, extracts via Claude, and writes results back to Supabase using `supabase-py`. No callback to .NET needed.
- **Frontend connects two ways** — Business logic (CRUD, dashboard, upload) goes through the .NET API. Auth (login/signup) and Realtime (status subscriptions) connect directly to Supabase, which is the standard pattern.
- **Validation pipeline runs in .NET on all parsed output** — Both CSV parsers and AI-extracted transactions pass through DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck before being written to the DB.
- **LLM structured output, not free text** — The Python service uses Claude's `tool_use` to force output matching Pydantic models. No regex parsing of LLM responses.
- **RLS enforces per-user data isolation** — Supabase Row Level Security policies use `auth.uid()` to restrict every table. The .NET API passes the Supabase JWT as a Bearer token; Supabase validates it at the DB level.
- **Bank profiles as config** — Adding a new bank = YAML config file + (CSV) a parser class, or (PDF/image) a prompt template. The bank identifier auto-detects which profile applies.
