---
title: API & Backend Architecture
updated: 2026-05-23
toc: true
---

# Service Overview

- **Framework:** ASP.NET Core Web API — **.NET 10 / C# 13**
- **Pattern:** Clean Architecture + CQRS via MediatR
- **Data access:** `supabase-csharp` SDK (PostgREST) — **no EF Core, no ORM**
- **Projects:**
  - `PersonalFinance.Api` — Controllers, middleware, Program.cs (composition root)
  - `PersonalFinance.Application` — CQRS commands/handlers, services, validators, DTOs, interfaces
  - `PersonalFinance.Domain` — Entities, domain events (zero external dependencies)
  - `PersonalFinance.Infrastructure` — Bank parsers, validation pipeline, typed HttpClients to AI service, Supabase Storage

> The `PersonalFinance.Persistence` project (EF Core + DbContext + migrations) was deleted in PF-S07. All data access now goes through `supabase-csharp`.

---

# Run, Debug, Build

## Local Dev

```sh
cd apps/api
dotnet run --project src/PersonalFinance.Api
```

API is available at `http://localhost:7208`. Hot reload supported.

## Build

```sh
cd apps/api
dotnet build PersonalFinance.slnx
dotnet publish -c Release
```

## Run via Docker

```sh
docker compose up --build api
```

See [docs/SETUP.md](SETUP.md) for full Docker Compose instructions.

---

# Configuration & Environment Variables

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `Supabase__Url` | Yes | `http://localhost:54321` | Local Supabase API URL |
| `Supabase__AnonKey` | Yes | `eyJ...` | Supabase anon key (client-context ops) |
| `Supabase__ServiceRoleKey` | Yes | `eyJ...` | Supabase service role key (bypasses RLS for server ops) |
| `AiService__BaseUrl` | Yes | `http://localhost:8000` | Python AI service URL |
| `ConnectionStrings__Default` | Yes | `Host=127.0.0.1;Port=54322;...` | PostgreSQL connection string for HealthChecks |

Set in `appsettings.Development.json` or environment. Never commit real `ServiceRoleKey` values.

> ⚠️ Keep current: verify these against `Program.cs` and `appsettings.json` when adding new config sections.

---

# Data Models & Persistence

- **Database:** PostgreSQL 17 (via Supabase local stack — `supabase start`)
- **Client:** `supabase-csharp` SDK — PostgREST fluent API (`.From<T>().Filter().Get()` / `.Insert()` / `.Update()` / `.Delete()`)
- **Schema migrations:** SQL files in `supabase/migrations/` — applied via `supabase db push`
- **Seeding:** `supabase/seed.sql` — 106 category rules seeded on `supabase db reset`

## Entity Conventions

Entities in `Domain/Entities/` inherit `BaseModel` (`Supabase.Postgrest.Models`) and use snake_case attribute annotations:

```csharp
[Table("transactions")]
public class Transaction : BaseModel
{
    [PrimaryKey("id", false)]
    public long Id { get; set; }

    [Column("date")]
    public DateTime Date { get; set; }

    [Column("amount_idr")]
    public decimal AmountIdr { get; set; }
    // ...
}
```

## Key Tables

| Table | Purpose |
|-------|---------|
| `transactions` | All transaction records across all banks |
| `category_rules` | 106+ keyword → category mapping rules |
| `uploaded_files` | File-hash deduplication registry (Tier 1 dedup) |
| `assets` | Asset registry (property, vehicles, savings, valuables) |
| `liabilities` | Liability tracking (loans, mortgages, BNPL) |
| `investments` | Investment portfolio (stocks, funds, bonds, crypto, P2P) |
| `statement_uploads` | AI processing queue — status tracking for async pipeline (planned PF-S11) |

Composite UNIQUE index on `transactions(date, amount_idr, description, wallet, flow, bank_running_balance)` enforces Tier 2/3 deduplication.

---

# HTTP API

Base URL (dev): `http://localhost:7208`

Authentication: **none currently** (API is wide open — PF-S08 Supabase Auth is planned next)

## Transactions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/transactions/health` | Health check |
| GET | `/api/transactions` | List transactions (server-paginated, filterable) |
| GET | `/api/transactions/{id}` | Get single transaction |
| POST | `/api/transactions/upload-preview` | Parse bank statement file, return preview (no persistence) |
| POST | `/api/transactions/submit` | Persist reviewed transactions |
| GET | `/api/transactions/aggregated` | Dashboard aggregates (summary, top categories, 6-month cashflow) |
| POST | `/api/transactions/categorize-preview` | Bulk AI categorize-preview (LLM batch, no persistence) |
| GET | `/api/transactions/supported-types` | Return supported banks and MIME types |

## Category Rules

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/categoryrules` | List all rules |
| POST | `/api/categoryrules` | Create a rule |
| PUT | `/api/categoryrules/{id}` | Update a rule |
| DELETE | `/api/categoryrules/{id}` | Delete a rule |

## Assets & Liabilities

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/assets` | List all assets |
| POST | `/api/assets` | Create an asset |
| PUT | `/api/assets/{id}` | Update an asset |
| DELETE | `/api/assets/{id}` | Delete an asset |
| GET | `/api/liabilities` | List all liabilities |
| POST | `/api/liabilities` | Create a liability |
| PUT | `/api/liabilities/{id}` | Update a liability |
| DELETE | `/api/liabilities/{id}` | Delete a liability |

## Investments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/investments` | List investment positions |
| POST | `/api/investments` | Create a position |
| PUT | `/api/investments/{id}` | Update a position |
| DELETE | `/api/investments/{id}` | Delete a position |

## AI & Analysis

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/spending-analysis` | Safe-to-Spend, variance, monthly breakdown |
| POST | `/api/portfolio-review` | AI portfolio review (delegates to Python AI service) |
| GET | `/api/journey` | Financial journey scores and tier status |

> ⚠️ Keep current: verify the full endpoint list against the controllers in `apps/api/src/PersonalFinance.Api/Controllers/` when new controllers are added.

---

# Bank Parser Architecture

Upload → `BankIdentifier.IdentifyAsync()` → route to parser:

```
File upload
    │
    ├─ CSV → BankIdentifier (sniffs content) → BcaCsvParser | DefaultCsvParser
    │
    ├─ PDF (known bank) → NeoBankPdfParser (direct — PdfPig + regex)
    │
    ├─ PDF (unrecognized) → LlmPdfParser → POST /parse-pdf (Python AI service)
    │
    └─ Image (.png/.jpg/.webp) → POST /parse-image (Python AI service, LLM vision)
```

All parsed output passes through the 5-stage validation pipeline:  
`DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck`

---

# Security

- **Auth:** None (PF-S08 planned — Supabase Auth + JwtBearer middleware)
- **Input validation:** FluentValidation on all commands
- **File upload:** MIME type validation; max size enforced; PDF parsing wrapped in try/catch with timeout
- **CORS:** Allows `http://localhost:8080` in development (see `Program.cs`)
- **DO NOT** expose this API publicly without adding authentication

---

# Observability

- **Logs:** Structured logging via `ILogger<T>` (partial coverage — PF-051 in progress)
- **Traces + Metrics:** OpenTelemetry → Alloy → Prometheus + Tempo → Grafana at `http://localhost:3000`
- **Health endpoint:** `GET /api/transactions/health` returns `{ "status": "Healthy" }`
- **Status dashboard:** `http://localhost:8080/status` — polls all services every 30s

---

# Adding a New Entity (checklist)

1. Entity class → `Domain/Entities/{Entity}.cs` (inherit `BaseModel`, add `[Table]`/`[Column]` attributes)
2. DTO → `Application/Dtos/{Entity}Dto.cs`
3. Command + Handler → `Application/Commands/Create{Entity}Command.cs`
4. Validator → `Application/Validation/Create{Entity}CommandValidator.cs`
5. Service interface → `Application/Interfaces/I{Entity}Service.cs`
6. Service implementation → `Application/Services/{Entity}Service.cs`
7. Domain Event → `Domain/Events/{Entity}CreatedEvent.cs`
8. Controller → `Api/Controllers/{Entity}Controller.cs`
9. DI registration → `Api/Program.cs`
10. SQL migration → `supabase/migrations/NNN_{description}.sql` — apply with `supabase db push`
11. Tests → `tests/PersonalFinance.Tests/`

---

# Troubleshooting

| Symptom | Check |
|---------|-------|
| Supabase connection fails | Run `supabase start`; verify `Supabase__Url` in appsettings |
| 500 errors on upload | Check AI service is running at `http://localhost:8000/health` |
| CORS errors | Verify frontend origin is in the CORS policy in `Program.cs` |
| Deduplication rejects valid rows | Check composite UNIQUE index; verify BankRunningBalance tie-break logic |

---

# Glossary

| Term | Meaning |
|------|---------|
| CQRS | Command Query Responsibility Segregation |
| MediatR | .NET mediator library — decouples commands from handlers |
| PostgREST | REST interface to PostgreSQL; used by `supabase-csharp` |
| RLS | Row Level Security — Supabase's per-user data isolation at the DB level |
| Tier 1/2/3 dedup | File-hash table + composite UNIQUE index + BankRunningBalance tie-break |
