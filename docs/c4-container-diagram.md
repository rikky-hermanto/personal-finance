# C4 Container Diagram — Personal Finance Platform (Level 2)

> **Living HLD** — Color-coded by status. Update `$tags` as work completes.
> Last updated: 2026-04-11

## Legend

| Color | Tag | Meaning |
|-------|-----|---------|
| 🟢 Green `#2ecc71` | `done` | Container exists and works today |
| ⬜ Gray `#bdc3c7` | `pending` | Not yet built or migrated |
| ⬛ Dark `#2c3e50` | — | External system |

## Diagram

```mermaid
C4Container
    title Personal Finance Platform — Container Diagram (C4 Level 2)

    %% AddElementTag is not supported in Mermaid's experimental C4 implementation.
    %% We will use UpdateElementStyle directly on the containers at the bottom of the diagram.

    Person(owner, "Owner", "Manages 5 Indonesian bank accounts, uploads monthly statements")

    System_Boundary(app, "Personal Finance Platform") {

        Container(frontend, "React Frontend", "React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui", "Dashboard, statement upload, categorization UI, cash flow charts")

        Container(api, ".NET 9 Web API", "ASP.NET Core, MediatR, FluentValidation, C# 13", "REST API — CQRS handlers, direct CSV parsers (BCA/Wise), validation pipeline, categorization engine")

        Container(ai_service, "AI Service", "Python 3.12+, FastAPI, Anthropic SDK", "LLM extraction for PDF/image bank statements (Superbank, NeoBank, Bank Jago) via Claude tool_use")

    }

    System_Boundary(supabase, "Supabase Platform (BaaS)") {

        ContainerDb(supa_db, "Supabase Database", "PostgreSQL 16, pgvector, PostgREST", "Transactions, category rules, bank profiles, vector embeddings for RAG")

        Container(supa_auth, "Supabase Auth", "GoTrue, OAuth 2.0 / OIDC", "User authentication, JWT tokens, Row Level Security integration")

        Container(supa_storage, "Supabase Storage", "S3-compatible object store", "Bank statement files — CSV, PDF, screenshot images")

        Container(supa_realtime, "Supabase Realtime", "Elixir, WebSocket, Postgres CDC", "Real-time DB change notifications to frontend when AI extraction completes")

        Container(supa_webhooks, "Database Webhooks", "Supabase Edge Functions, Deno", "Event-driven triggers — fires on new file upload to invoke AI Service")

    }

    System_Ext(claude_api, "Anthropic Claude API", "Primary LLM provider — structured extraction via tool_use, vision API for screenshots")
    System_Ext(openai_api, "OpenAI API", "Fallback LLM provider for extraction")

    Rel(owner, frontend, "Uploads statements, views dashboard", "HTTPS")
    Rel(frontend, api, "REST API calls", "JSON / HTTPS :7208")
    Rel(frontend, supa_auth, "User login / signup", "HTTPS")
    Rel(frontend, supa_realtime, "Subscribes to extraction status", "WebSocket")
    Rel(api, supa_db, "CRUD via PostgREST", "supabase-csharp SDK")
    Rel(api, supa_storage, "Upload / retrieve statement files", "supabase-csharp SDK")
    Rel(supa_storage, supa_webhooks, "File upload event", "Internal trigger")
    Rel(supa_webhooks, ai_service, "Triggers PDF/image extraction", "HTTP POST :8000")
    Rel(ai_service, supa_db, "Writes extracted transactions", "supabase-py SDK")
    Rel(ai_service, claude_api, "PDF/image → structured JSON", "HTTPS, tool_use")
    Rel(ai_service, openai_api, "Fallback extraction", "HTTPS, JSON mode")

    %% done elements styling
    UpdateElementStyle(frontend, $bgColor="#2ecc71", $fontColor="white", $borderColor="#27ae60")
    UpdateElementStyle(api, $bgColor="#2ecc71", $fontColor="white", $borderColor="#27ae60")

    %% pending elements styling
    UpdateElementStyle(ai_service, $bgColor="#bdc3c7", $fontColor="#34495e", $borderColor="#7f8c8d")
    UpdateElementStyle(supa_db, $bgColor="#bdc3c7", $fontColor="#34495e", $borderColor="#7f8c8d")
    UpdateElementStyle(supa_auth, $bgColor="#bdc3c7", $fontColor="#34495e", $borderColor="#7f8c8d")
    UpdateElementStyle(supa_storage, $bgColor="#bdc3c7", $fontColor="#34495e", $borderColor="#7f8c8d")
    UpdateElementStyle(supa_realtime, $bgColor="#bdc3c7", $fontColor="#34495e", $borderColor="#7f8c8d")
    UpdateElementStyle(supa_webhooks, $bgColor="#bdc3c7", $fontColor="#34495e", $borderColor="#7f8c8d")

    UpdateRelStyle(owner, frontend, $textColor="#2ecc71", $lineColor="#2ecc71")
    UpdateRelStyle(frontend, api, $textColor="#2ecc71", $lineColor="#2ecc71")
    UpdateRelStyle(frontend, supa_auth, $textColor="#bdc3c7", $lineColor="#bdc3c7")
    UpdateRelStyle(frontend, supa_realtime, $textColor="#bdc3c7", $lineColor="#bdc3c7")
    UpdateRelStyle(api, supa_db, $textColor="#bdc3c7", $lineColor="#bdc3c7")
    UpdateRelStyle(api, supa_storage, $textColor="#bdc3c7", $lineColor="#bdc3c7")
    UpdateRelStyle(supa_storage, supa_webhooks, $textColor="#bdc3c7", $lineColor="#bdc3c7")
    UpdateRelStyle(supa_webhooks, ai_service, $textColor="#bdc3c7", $lineColor="#bdc3c7")
    UpdateRelStyle(ai_service, supa_db, $textColor="#bdc3c7", $lineColor="#bdc3c7")
    UpdateRelStyle(ai_service, claude_api, $textColor="#bdc3c7", $lineColor="#bdc3c7")
    UpdateRelStyle(ai_service, openai_api, $textColor="#bdc3c7", $lineColor="#bdc3c7")
```

## Container Status

| # | Container | Tech | Status | Notes |
|---|-----------|------|--------|-------|
| 1 | React Frontend | React 18, Vite, TS, Tailwind | **Done** | Dashboard, upload, categorization all working |
| 2 | .NET 9 Web API | ASP.NET Core, MediatR, EF Core | **Done** | Needs refactor: replace EF Core with `supabase-csharp` SDK |
| 3 | AI Service | Python FastAPI, Anthropic SDK | **Pending** | PF-009 in progress; full service not built |
| 4 | Supabase Database | PostgreSQL 16 + pgvector | **Pending** | Migrate schema via `dotnet ef migrations script` → paste to Supabase SQL editor |
| 5 | Supabase Auth | GoTrue, OAuth 2.0 | **Pending** | Replaces deferred Auth0 plan |
| 6 | Supabase Storage | S3-compatible | **Pending** | Replaces local file handling in upload pipeline |
| 7 | Supabase Realtime | WebSocket, Postgres CDC | **Pending** | Eliminates polling after AI extraction |
| 8 | Database Webhooks | Edge Functions, Deno | **Pending** | Event-driven AI trigger; replaces sync .NET → Python HTTP call |

## How to Update This Diagram

When a container is complete, move its `UpdateElementStyle` from the `%% pending elements styling` section to the `%% done elements styling` section, and flip its relationship line colors from `#bdc3c7` to `#2ecc71`.
