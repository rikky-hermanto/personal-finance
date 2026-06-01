# [EPIC] End-to-End State: Supabase Migration & Hybrid AI Parsing Pipeline

## 🎯 Background & Context

The Personal Finance Platform aims to automate the tedious monthly reconciliation of bank statements across multiple formats (CSV, PDF, Images). 

Currently, the project is structured with a **.NET 9 Web API** handling core business logic, a **Python FastAPI** service handling Document AI/LLM extraction, and **PostgreSQL** as the database layer.

Based on our architectural evaluation, the project is undergoing a **strategic pivot from EF Core + raw Postgres to the Supabase platform**. This shift provides critical infrastructure for our AI workflow:
1. **Async AI Processing:** Eliminating blocking HTTP calls by using Supabase Storage uploads and Database Webhooks to trigger the Python AI extractor in the background.
2. **Real-time UI:** Subscribing to database changes using Supabase Realtime so the React UI updates automatically after AI processing completes.
3. **Unified Stack:** Replacing standalone Postgres, S3-compatible storage, and Auth0 with Supabase's integrated PostgreSQL platform.

## 🏛️ Current Architectural State

- **Frontend:** React 18 / TypeScript / Tailwind (in `apps/frontend`)
- **Backend (.NET 9):** Clean Architecture + CQRS via MediatR (in `apps/api`)
- **AI Service (Python):** FastAPI + PyMuPDF + LangChain/Claude (in `services/ai-service`)
- **Database Layer (In-Transition):** Currently EF Core, moving to `supabase-csharp`.

## 📦 Migration & Implementation Roadmap

The following phases must be executed to complete the end-to-end pipeline:

### Phase 1: Supabase Setup & Schema Migration
- `[ ]` Initialize Supabase project (`supabase init`) and start local stack.
- `[ ]` Export current EF Core schema to `supabase/migrations/001_initial_schema.sql`.
- `[ ]` Migrate the 106 existing category rules into a `seed.sql` script.
- `[ ]` Enable `pgvector` extension locally.

### Phase 2: Application Layer Supabase Integration 
- `[ ]` Install `supabase-csharp` NuGet package into `.NET` backend.
- `[ ]` Refactor `Transaction` and `CategoryRule` entities to use Supabase attributes.
- `[ ]` Refactor MediatR Command/Query handlers from `DbContext` to Supabase fluent PostgREST API.
- `[ ]` **DELETE** the `PersonalFinance.Persistence` project entirely to enforce clean boundaries.

### Phase 3: Auth Integration
- `[ ]` Implement Supabase Auth (replacing Auth0).
- `[ ]` Configure .NET `JwtBearer` middleware to validate Supabase JWT tokens.
- `[ ]` Update frontend login flow to use `@supabase/supabase-js`.
- `[ ]` Implement Row-Level Security (RLS) on transactions tied to `user_id`.

### Phase 4: Storage & Statement Upload Pipeline
- `[ ]` Create `bank-statements` bucket with per-user path policies.
- `[ ]` Implement deterministic **CSV parsers** (BCA, Wise) completely in .NET to stay synchronous.
- `[ ]` Modify PDF/Image upload endpoint to return a `processing_id` immediately while storing the file.
- `[ ]` Build the .NET 5-stage validation pipeline (Date Normalizer, Decimal Fixer, Currency Standardizer, Schema Validator, Deduplicate Check).

### Phase 5: Event-Driven AI Pipeline Setup
- `[ ]` Create `statement_uploads` tracking table with statuses (`pending`, `processing`, `done`, `failed`).
- `[ ]` Deploy Supabase **Database Webhook** to trigger on `INSERT` to `statement_uploads`.
- `[ ]` Connect webhook to Python AI Service (`/webhooks/process`).
- `[ ]` Ensure Python AI Service queries Storage, generates structured extraction using Claude, updates the DB, and completes the status.
- `[ ]` Tie React Frontend to Supabase Realtime to listen for `done` statuses and refresh.

### Phase 6: RAG & Next Steps (Sprint 2+)
- `[ ]` Implement transaction embeddings generation upon successful parsing.
- `[ ]` Build natural language querying with pgvector match functions.

## 🤝 Open Questions for Review

> [!IMPORTANT]
> **Issue Breakdown Strategy:** Do you want to break these 6 phases down into independent user stories/issues in GitHub? Or should we leave them bundled as this high-level Epic with subtasks?

> [!NOTE]
> **Implementation order:** Should we begin by knocking out the local Supabase CLI configurations (`Phase 1`) right now, or is there another part of the Epic you want to start with?

## 🧪 Verification Plan

Once all phases are checked off, we will verify by:
1. End-to-end uploading a PDF statement via the UI for a test bank profile.
2. Confirming an immediate `processing_id` response from the backend.
3. Automatically observing the async Database webhook firing in the Python console.
4. Watching the frontend table instantly populate via WebSockets when the data extraction is successfully validated and posted back to the database.
