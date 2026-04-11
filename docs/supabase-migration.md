# Supabase Migration Plan

## Overview

This document captures the architectural decision to migrate the Personal Finance app from a self-managed PostgreSQL + EF Core stack to Supabase. The migration is broken into six phases and interleaved with the existing AI learning track.

The primary goal is hands-on exploration of the full Supabase platform — Database, Auth, Storage, Realtime, and webhooks — in the context of a real application with non-trivial requirements (multi-bank parsing, LLM extraction, async processing).

---

## Why Supabase

The app has three features that benefit directly from Supabase's architecture:

1. **Async AI processing**: Bank statements (PDF/image) are processed by an LLM. This is slow. Today the API blocks on the result. Supabase Storage + Database Webhooks makes this naturally event-driven — the upload triggers AI processing in the background, and Realtime notifies the frontend when it's done. No message queue needed.

2. **Real-time UI updates**: Without Supabase Realtime, the frontend polls for processing status. Realtime WebSocket subscriptions eliminate this with zero extra infrastructure.

3. **Unified platform**: Auth, Storage, and Database are integrated at the Postgres level (Row Level Security). This replaces three separate integrations (Auth0 + S3-compatible storage + raw Postgres) with one.

**What does NOT change:** The .NET 9 API remains as the middle tier. Business logic (parsers, validation pipeline, CQRS handlers) stays in .NET. The Python FastAPI AI service stays in Python. Supabase replaces the data persistence and infrastructure layer, not the application layer.

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React 18 Frontend                           │
│  ┌──────────────────┐    ┌────────────────────────────────────┐ │
│  │ @supabase/js     │    │ REST calls via fetch()             │ │
│  │  - Auth (login)  │    │  - CRUD, upload, dashboard, etc.  │ │
│  │  - Realtime sub  │    │  - Bearer token from Supabase Auth │ │
│  └────────┬─────────┘    └───────────────┬────────────────────┘ │
└───────────┼──────────────────────────────┼──────────────────────┘
            │ direct                       │ via API
            ▼                              ▼
┌───────────────────────┐   ┌──────────────────────────────────────┐
│   Supabase Platform   │   │        .NET 9 Web API (C#)           │
│                       │   │  Controllers → MediatR CQRS          │
│  Auth (GoTrue/JWT)    │   │  FluentValidation                    │
│  Storage (buckets)  ◄─┼───┤  Infrastructure:                     │
│  Realtime (WS)        │   │   - supabase-csharp (PostgREST)      │
│  Database Webhooks ───┼─┐ │   - StorageService (Supabase Storage)│
│                       │ │ │   - CSV Parsers (BCA, Wise, Default) │
│  ┌─────────────────┐  │ │ │   - Validation Pipeline              │
│  │ PostgreSQL 16   │  │ │ └──────────────────────────────────────┘
│  │ + pgvector      │  │ │
│  │                 │  │ │       Webhook POST on INSERT
│  │ transactions    │  │ │         to statement_uploads
│  │ category_rules  │  │ │
│  │ statement_      │  │ │  ┌──────────────────────────────────┐
│  │   uploads       │  │ └──►  Python AI Service (FastAPI)     │
│  │ embeddings      │  │      │                                │
│  │ (RLS enforced)  │◄─┼──────┤  1. Download file from Storage │
│  └─────────────────┘  │      │  2. PyMuPDF / Claude Vision    │
│                       │      │  3. Claude tool_use extraction  │
└───────────────────────┘      │  4. Write results to Supabase  │
                               │  5. Update status → "done"     │
                               │                                │
                               │  supabase-py + Claude API      │
                               └────────────────────────────────┘
```

### File Upload → AI Processing → Realtime Notification

```
User uploads PDF
       │
.NET API uploads to Supabase Storage (bank-statements/{user_id}/{bank}/{file})
       │
.NET inserts row into statement_uploads (status: "pending")
       │
.NET returns { processing_id } immediately — no blocking
       │
Supabase Database Webhook fires on INSERT
       │
Python AI Service receives webhook:
  a. Downloads file from Supabase Storage
  b. Extracts text via PyMuPDF (PDF) or sends raw image (screenshot)
  c. Claude API extracts transactions via tool_use (structured output)
  d. Writes transactions to Supabase DB via supabase-py
  e. Updates statement_uploads.status → "done"
       │
Supabase Realtime broadcasts the status change
       │
React (subscribed via @supabase/supabase-js) auto-refreshes transaction list
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| .NET stays as middle tier | Business logic (parsing, validation, CQRS) belongs in the application layer, not the DB layer. Supabase handles persistence, not logic. |
| Frontend auth connects directly to Supabase | Standard pattern. The JWT is then forwarded to .NET API in the `Authorization` header. |
| Frontend Realtime connects directly to Supabase | Proxying WebSockets through .NET adds latency and complexity with no benefit. |
| Python AI service writes directly to Supabase | After webhook trigger, Python is autonomous. No callback to .NET needed — cleaner event-driven flow. |
| CSV parsers stay synchronous | BCA, Wise are deterministic column-mapped formats. Zero LLM cost, 100% accuracy, instant response. No reason to make these async. |
| PDF/image parsers become event-driven | LLM extraction takes 5–15 seconds. Making the user wait on a synchronous HTTP response is poor UX. Async via webhooks is the right pattern. |

---

## Migration Phases

### Phase 1: Supabase Setup + Schema Migration

- Initialize Supabase project (`supabase init` via CLI or cloud dashboard)
- Export current EF Core schema: `dotnet ef migrations script`
- Create `supabase/migrations/001_initial_schema.sql` — DDL for `transactions` and `category_rules`
- Create `supabase/seed.sql` with 106 category rules (currently seeded in `AppDbContext.OnModelCreating`)
- Enable `pgvector` extension
- Set up Row Level Security policies (permissive initially, tightened in Phase 3)
- **New:** `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`

### Phase 2: Replace EF Core with supabase-csharp

- Add `Supabase` NuGet package to `PersonalFinance.Infrastructure`
- Create `SupabaseSettings`, `AddSupabase()` DI extension — replaces `AddPersistence()`
- Annotate `Transaction` and `CategoryRule` entities with `[Table]`, `[PrimaryKey]`, `[Column]` (inherit `BaseModel`)
- Rewrite CQRS command handlers: `DbContext.AddAsync/SaveChangesAsync` → `supabase.From<T>().Insert()`
- Rewrite service queries: LINQ → PostgREST fluent API (`.Filter().Order().Get()`)
- Delete `PersonalFinance.Persistence` project entirely (also resolves the ARCH-01 layer violation)
- **Modified:** `Domain/Entities/`, `Application/Commands/`, `Application/Services/`, `Program.cs`
- **Deleted:** entire `Persistence/` project

### Phase 3: Supabase Auth

- Replace planned Auth0 integration with Supabase Auth
- .NET validates Supabase JWT tokens via `Microsoft.AspNetCore.Authentication.JwtBearer`
- Add `user_id` column to `transactions` and `category_rules` — RLS enforces per-user data isolation
- React: `@supabase/supabase-js` handles login/signup/session; access token forwarded to .NET API
- **New:** `Api/Auth/SupabaseAuthMiddleware.cs`, `supabase/migrations/002_auth_rls.sql`, `frontend/src/lib/supabase.ts`, `frontend/src/pages/Login.tsx`

### Phase 4: Supabase Storage + Validation Pipeline

- Create `bank-statements` bucket with per-user path policies (`{user_id}/{bank}/{filename}`)
- Modify upload endpoint: files land in Storage before parsing begins
- CSV path stays synchronous: upload → download → parse → return preview
- PDF/image path becomes async: upload → return `processing_id` → continue in background
- Build 5-stage validation pipeline: DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck
- DeduplicateCheck queries via `supabase-csharp` instead of EF Core
- **New:** `Application/Interfaces/IFileStorageService.cs`, `Infrastructure/Supabase/StorageService.cs`, `Infrastructure/Validation/*.cs`

### Phase 5: Event-Driven AI Pipeline + Realtime

- Create `statement_uploads` table: `id`, `user_id`, `file_path`, `bank_id`, `status` (pending/processing/done/failed)
- Configure Supabase Database Webhook: INSERT on `statement_uploads` → POST to Python AI service
- Python AI service gains `/webhooks/process` endpoint — full async extraction pipeline
- Enable Supabase Realtime on `statement_uploads`; React subscribes for live status updates
- Wire all three LLM-based parsers (Superbank PDF, NeoBank PDF, Bank Jago screenshot) through the webhook pipeline
- **New:** `supabase/migrations/004_statement_uploads.sql`, `ai-service/app/routers/webhooks.py`, `frontend/src/hooks/useRealtimeSubscription.ts`

### Phase 6: RAG + Vector Search (Sprint 2+)

- pgvector is available by default in Supabase — no manual extension setup needed
- Generate embeddings for transaction descriptions via Claude/OpenAI embeddings API
- Store in Supabase and query via `match_transactions` Postgres function (pgvector cosine similarity)
- Natural language query: embed question → retrieve relevant transactions → Claude synthesizes answer
- Aligns with sprint plan tasks PF-018, PF-019, PF-020

---

## Existing Task Impact Summary

| Category | Task IDs | Count |
|----------|----------|-------|
| Unaffected (parser / AI / frontend only) | PF-009, PF-010, PF-012, PF-015, PF-034, PF-035, PF-038, PF-042, PF-043, PF-045, PF-051, PF-052 | 12 |
| Modified (same goal, query layer changes) | PF-011, PF-013, PF-014, PF-016, PF-017, PF-018, PF-019, PF-020, PF-026, PF-028, PF-031, PF-036, PF-037, PF-050 | 14 |
| Absorbed into Supabase phases | PF-039, PF-040, PF-044, PF-047, PF-048 | 5 |
| Resolved by the migration itself | PF-049, PF-053, PF-054 | 3 |
| New (Supabase-specific) | PF-S01 through PF-S13 | 13 |

---

## Local Development

Supabase runs fully locally via the Supabase CLI:

```bash
# Initialize (run once at project root)
supabase init

# Start local stack (Postgres, Auth, Storage, Realtime, Studio UI)
supabase start

# Apply migrations and seed data
supabase db push

# Open local Studio dashboard
open http://localhost:54323
```

The standalone `postgres:16-alpine` Docker service is replaced by the Supabase local stack. `docker-compose.yml` is updated to remove the `db` service and add the AI service container.

---

## Verification Milestones

| Phase | Passing criteria |
|-------|-----------------|
| 1 — Setup | `supabase db push` succeeds; tables + seed data visible in Studio |
| 2 — SDK | All existing Playwright E2E tests pass with Supabase backend; `dotnet build` has zero EF Core references |
| 3 — Auth | Login → JWT → .NET API accepts Bearer token → RLS blocks cross-user data access |
| 4 — Storage | CSV upload → file in Storage → preview returned. PDF upload → `processing_id` returned immediately (no blocking). |
| 5 — Event-driven | PDF upload → webhook fires → AI extracts → transactions in DB → React auto-refreshes without polling |
| 6 — RAG | Natural language query returns correct transactions retrieved via pgvector similarity search |
