# Personal Finance — Setup Guide

> Reviewed against package scripts, Dockerfiles, Compose and Supabase configuration on 2026-10-08. Commands below describe the configured development path; startup was not run during this documentation sync.

## Prerequisites

- Windows PowerShell, Docker Desktop running, Node.js 20+ and npm.
- .NET 10 SDK for the API.
- Python >=3.11.9 (the AI Dockerfile uses 3.12).
- Supabase CLI provided by the root npm dependency; use `npx supabase` from the repository root.
- A configured Gemini or Anthropic key for generative AI; embedding configuration is independent.

## Install and configure

From the repository root:

```powershell
rtk npm install
rtk npm --prefix apps/frontend install
rtk proxy py -m venv services/ai-service/.venv
rtk proxy services/ai-service/.venv/Scripts/python.exe -m pip install -e './services/ai-service[dev]'
```

Use an existing virtual environment when available. The AI package deliberately bounds parts of the LangGraph/LangChain/evaluation dependency stack; do not remove those bounds to resolve installation failures without checking compatibility.

Copy example files only when the destination does not already exist; preserve your local settings:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path apps/frontend/.env)) { Copy-Item apps/frontend/.env.example apps/frontend/.env }
if (-not (Test-Path services/ai-service/.env)) { Copy-Item services/ai-service/.env.example services/ai-service/.env }
if (-not (Test-Path apps/api/src/PersonalFinance.Api/appsettings.Development.json)) {
    Copy-Item apps/api/src/PersonalFinance.Api/appsettings.Development.example.json apps/api/src/PersonalFinance.Api/appsettings.Development.json
}
```

Configure the following locally without copying credentials into documentation or tracked files:

| Consumer | Settings |
|---|---|
| .NET API | `Supabase:Url`, `Supabase:AnonKey`, `Supabase:ServiceRoleKey`; `AiService:BaseUrl`; `ConnectionStrings:Default` for the health probe |
| Frontend | `VITE_API_URL`, `VITE_AI_SERVICE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| AI generation | `AI_PROVIDER=gemini|anthropic`, matching API key, matching `AI_MODEL` |
| AI embeddings | `EMBEDDING_PROVIDER=gemini|openai` (default Gemini), matching key, optional `EMBEDDING_MODEL`, `DATABASE_URL` |
| LangGraph tools | `NET_API_BASE_URL` (default `http://localhost:7208`) |
| Tracing | OTEL endpoint/service name; optional Langfuse host/public/secret keys |
| Residual categorization | `CATEGORIZATION_BACKEND=llm` by default; Jev requires separate key, pinned model and calibrated threshold after evaluation |

Obtain local Supabase keys from `rtk proxy npx supabase status` after startup; keep service-role/secret keys server-side. The frontend Supabase module throws when its URL or anon key is missing. The frontend example currently uses HTTPS 7209 for the API; use the protocol/port of your selected API launch profile (HTTP 7208 is used below).

## Start local development

The root script starts Supabase, Compose database/monitoring containers, and host API/UI/AI processes:

```powershell
rtk npm start
```

Its `prestart` hook starts Docker Desktop if necessary and stops conflicting processes on 8080, 8000 and the API port, plus leftover PersonalFinance.Api processes. To preserve independently running processes, start the components explicitly instead.

From the repository root, start infrastructure:

```powershell
rtk proxy npx supabase start
rtk docker compose up -d db alloy prometheus loki tempo grafana
```

Then run each application in its own terminal:

```powershell
# Repository root — .NET API
rtk dotnet run --project apps/api/src/PersonalFinance.Api
```

```powershell
# Repository root — frontend
rtk npm --prefix apps/frontend run dev
```

```powershell
# Repository root — AI service (config resolves its own .env)
rtk proxy services/ai-service/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000 --app-dir services/ai-service
```

| Service | Local URL / port |
|---|---|
| Frontend | http://localhost:8080 |
| API | http://localhost:7208; launch profiles also configure HTTPS 7209 |
| API health | http://localhost:7208/health |
| Development OpenAPI | http://localhost:7208/openapi/v1.json |
| FastAPI health / docs | http://localhost:8000/health and http://localhost:8000/docs |
| Supabase API / PostgREST | http://127.0.0.1:54321 |
| Supabase database | 127.0.0.1:54322, database postgres |
| Supabase Studio | http://127.0.0.1:54323 |
| Grafana | http://localhost:3000 |
| Compose standalone database | localhost:5432; separate from Supabase |

The standalone `db` service remains in Compose and the root startup script. Application entities use Supabase/PostgREST; AI retrieval uses Supabase's direct Postgres URL. The .NET health probe uses its separately configured connection string, so a green standalone database probe alone does not prove application persistence works.

## Database migrations

Schema changes are timestamped SQL files in `supabase/migrations/`. The API does not run EF migrations or automatically apply these files.

For an already-running local database, inspect pending migrations and apply them explicitly:

```powershell
rtk proxy npx supabase migration list --local
rtk proxy npx supabase db push --local
```

Applying migrations is a separate operation from writing a migration or running a build. Do not substitute an unqualified remote push for local setup. Seed configuration is in `supabase/config.toml` and `supabase/seed.sql`. Database reset removes local data and is not a routine upgrade step.

Embedding storage is `vector(1536)`. Changing embedding provider/model requires compatible vectors and a backfill for the selected model; retrieval filters by model. See the [embedding guide](../services/ai-service/docs/rag-embeddings-howto.md).

## Docker-only boundary

Dockerfiles exist for all three applications, but `docker compose up --build` is not a verified complete Supabase deployment. Current Compose does not inject the API Supabase settings, AI `DATABASE_URL`/`NET_API_BASE_URL`/embedding/Langfuse/Jev settings, or frontend Supabase/AI build variables. Inside a container, localhost points to that container. Frontend Vite values must be set at build time. The AI Dockerfile also installs the package before copying its app sources; verify packaged dependencies and runtime imports when preparing deployment.

Use the host development path above. Container deployment hardening remains separate work; no configuration changes were made by this documentation sync.

## Stop and verify

Stop application terminals with Ctrl+C. Stop the Compose containers without removing volumes:

```powershell
rtk docker compose stop
rtk proxy npx supabase stop
```

For a smoke check, open Journey, import a sanitized supported statement through Cashflow → Upload, review and submit, then check Transactions. Transaction chat requires embeddings plus a working generative provider; FastAPI `/health` only returns liveness and does not verify those dependencies.

## Local checks

```powershell
# Repository root
rtk npm run lint
rtk npm run build
rtk npm --prefix apps/frontend run test:desk
rtk npm --prefix apps/frontend run test:macro
rtk dotnet test apps/api/PersonalFinance.slnx
# Run from services/ai-service, with external provider calls mocked
rtk proxy .venv/Scripts/python.exe -m pytest
```

Frontend build is Vite bundling, not a standalone TypeScript check. Playwright (`rtk npm run e2e` from root) starts/reuses the frontend; backend-dependent specs still need their services. Inspect skipped integration tests and evaluation budgets before claiming functional coverage or running live LLM evaluations.

See [current status](STATUS.md), [architecture](architecture/architecture-diagram.md) and [AI service configuration](../services/ai-service/README.md).
