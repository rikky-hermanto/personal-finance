---
title: API & Backend Architecture
updated: 2025-09-15
toc: true
---

# Service Overview

- **Framework:** ASP.NET Core WebAPI (.NET 8)
- **Process:** HTTP server, MediatR CQRS, background services
- **Projects:**
  - `PersonalFinance.Api` (API)
  - `PersonalFinance.Application` (CQRS, business logic)
  - `PersonalFinance.Domain` (entities)
  - `PersonalFinance.Persistence` (EF Core, migrations)
  - `PersonalFinance.Infrastructure` (parsers, integrations)

# Run, Debug, Build

## Local Dev
```sh
cd api/src/PersonalFinance.Api
dotnet run
```

## Build/Publish
```sh
dotnet publish -c Release
```

- **Hot reload:** Supported by `dotnet run`
- **Debug ports:** See launch settings (`Properties/launchSettings.json`)
- **Artifacts:** `bin/`, `obj/`

# Configuration & Secrets

| NAME                        | Required | Example                                         | Source/file                                 |
|-----------------------------|----------|-------------------------------------------------|---------------------------------------------|
| ConnectionStrings:Default   | Yes      | Host=localhost;Port=5432;Database=...           | `appsettings.Development.json`              |
<!-- TODO: add more as needed -->

# Database & Data Models

- **DB:** PostgreSQL
- **ORM:** Entity Framework Core
- **Migrations:** `api/src/PersonalFinance.Persistence/Migrations/`
- **Seed:** See `AppDbContext.cs` for initial data

```mermaid
erDiagram
    Transaction ||--o{ CategoryRule : categorizes
    Transaction {
      int Id
      DateTime Date
      string Description
      string Remarks
      string Flow
      string Type
      string Category
      string Wallet
      decimal AmountIdr
      string Currency
      decimal? ExchangeRate
    }
    CategoryRule {
      int Id
      string Keyword
      string Type
      string Category
      int KeywordLength
    }
```

# Messaging & Async

- **Background jobs:** Parsers, importers (see `Infrastructure/Parsers/`)
- **Queues:** <!-- TODO: add info if present -->

# HTTP API

| Method | Path                        | Auth | Description                | Handler/File                                      |
|--------|-----------------------------|------|----------------------------|---------------------------------------------------|
| GET    | /api/transactions/health    | None | Health check               | TransactionsController.cs                         |
| GET    | /api/transactions           | None | List transactions          | TransactionsController.cs                         |
| POST   | /api/transactions           | None | Add transaction            | TransactionsController.cs                         |
| PUT    | /api/transactions/{id}      | None | Update transaction         | TransactionsController.cs                         |
| DELETE | /api/transactions/{id}      | None | Delete transaction         | TransactionsController.cs                         |
| POST   | /api/transactions/upload-preview | None | Preview file upload   | TransactionsController.cs                         |
| GET    | /api/categoryrules          | None | List category rules        | CategoryRulesController.cs                        |
| POST   | /api/categoryrules          | None | Add category rule          | CategoryRulesController.cs                        |
| PUT    | /api/categoryrules/{id}     | None | Update category rule       | CategoryRulesController.cs                        |
| DELETE | /api/categoryrules/{id}     | None | Delete category rule       | CategoryRulesController.cs                        |

## Example: Add Transaction
```sh
curl -X POST "http://localhost:7208/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-09-15","description":"Lunch","amountIdr":50000,"category":"Food"}'
```

## Error Model
- Standard: `{ "message": string, "detail"?: string }` (see `ApiError.cs`)
- Validation: HTTP 400 with error message

## Pagination/Filter/Sort
- <!-- TODO: add conventions if present -->

## Rate limits/Idempotency
- <!-- TODO: add info if present -->

# Security

- **AuthN:** None (API is open by default)
- **AuthZ:** None
- **Input validation:** FluentValidation
- **CORS:** Allows `http://localhost:8080` (see `Program.cs`)
- **Threats:** No user auth; do not expose API publicly without protection

# Observability

- **Logs:** ASP.NET logging (see `appsettings.json`)
- **Health:** `/api/transactions/health`
- **Metrics/tracing:** <!-- TODO: add info if present -->

# Background Jobs / Schedulers

- **Purpose:** File parsing, import
- **Where:** `Infrastructure/Parsers/`, MediatR handlers
- **Run locally:** Handled by API process

# Operations

- **Migrations:**
```sh
cd api/src/PersonalFinance.Persistence
dotnet ef migrations add <Name>
dotnet ef database update
```
- **Backups:** <!-- TODO: add info if present -->
- **Feature flags:** <!-- TODO: add info if present -->
- **Maintenance:** <!-- TODO: add info if present -->

# Troubleshooting

- **DB connection fails:** Check `appsettings.Development.json`
- **API 500 errors:** Check logs, validate DB is running
- **CORS:** Ensure allowed origins in CORS policy

# FAQ

- **How do I add a new entity?**
  - Add to `Domain/Entities/`, update `AppDbContext.cs`
- **How do I add a migration?**
  - Use `dotnet ef migrations add <Name>`

# Glossary

- **CQRS:** Command Query Responsibility Segregation
- **EF Core:** Entity Framework Core ORM
- **DTO:** Data Transfer Object
- **MediatR:** .NET library for CQRS/mediator pattern

# Repo Signals Scanned

- `api/src/PersonalFinance.Api/Program.cs`
- `api/src/PersonalFinance.Api/Controllers/TransactionsController.cs`
- `api/src/PersonalFinance.Api/Controllers/CategoryRulesController.cs`
- `api/src/PersonalFinance.Persistence/AppDbContext.cs`
- `api/src/PersonalFinance.Persistence/Migrations/20250615130438_InitPersonalFinance.cs`
- `api/src/PersonalFinance.Api/appsettings.json`
- `api/src/PersonalFinance.Api/appsettings.Development.json`
- `api/src/PersonalFinance.Api/Models/ApiError.cs`
- `api/src/PersonalFinance.Domain/Entities/Transaction.cs`
- `api/src/PersonalFinance.Domain/Entities/CategoryRule.cs`
- `api/tests/PersonalFinance.Tests/CategoryRuleServiceTests.cs`
