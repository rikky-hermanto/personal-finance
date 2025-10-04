---
title: Copilot Instructions & Solution Map
updated: 2025-09-15
toc: true
---

# Overview

Personal Finance is a full-stack, monorepo solution for managing and analyzing personal financial transactions. It features a modern React + Vite front-end and a .NET 8 Web API backend with PostgreSQL, supporting extensible rules for transaction categorization. The repo is organized by solution layers for clear separation of concerns and developer productivity.

**Monorepo layout:**

```
├── src/                # Front-end (React, Vite, TypeScript)
├── api/                # Backend (.NET, Entity Framework, API)
│   └── src/
│       ├── PersonalFinance.Api/           # API project
│       ├── PersonalFinance.Application/   # Application logic
│       ├── PersonalFinance.Domain/        # Domain models
│       ├── PersonalFinance.Infrastructure/# Infra/services
│       └── PersonalFinance.Persistence/   # DB context/migrations
│   └── tests/             # Backend unit tests
├── public/              # Static assets
├── docs/                # Documentation (this folder)
├── package.json         # Front-end config/scripts
├── vite.config.ts       # Vite config
├── tailwind.config.ts   # Tailwind CSS config
├── eslint.config.js     # Lint config
└── README.md            # Project info
```

# Architecture at a Glance

```mermaid
flowchart LR
    A[Client (React/Vite)] -->|REST| B[API (.NET WebAPI)]
    B -->|EF Core| C[(PostgreSQL)]
    B --> D[Background Services]
    B --> E[Category Rules Engine]
    B --> F[Health/Observability]
```

# What’s in Each Layer

- **Client:** React 18, Vite, TypeScript, shadcn/ui, Tailwind CSS (`src/`, `vite.config.ts`)
- **API:** ASP.NET Core WebAPI, MediatR, FluentValidation, OpenAPI (`api/src/PersonalFinance.Api/`)
- **Application:** CQRS, business logic, MediatR handlers (`api/src/PersonalFinance.Application/`)
- **Domain:** Entities, value objects, rules (`api/src/PersonalFinance.Domain/`)
- **Persistence:** Entity Framework Core, migrations, PostgreSQL (`api/src/PersonalFinance.Persistence/`)
- **Infrastructure:** Parsers, external integrations (`api/src/PersonalFinance.Infrastructure/`)
- **Tests:** xUnit, Moq, in-memory DB (`api/tests/PersonalFinance.Tests/`)

# Developer Quickstart

## Prerequisites
- Node.js >= 18.x
- npm >= 9.x
- .NET 8 SDK
- PostgreSQL (local or Docker)

## Install & Bootstrap
```sh
npm install
cd api/src/PersonalFinance.Api
# (optional) dotnet restore
```

## Run (Dev)
```sh
# Front-end
npm run dev
# API (from api/src/PersonalFinance.Api)
dotnet run
```

## Run (Production)
```sh
npm run build
# API
cd api/src/PersonalFinance.Api
dotnet publish -c Release
```

# Environments & Configuration

| File                                 | Purpose                        |
|--------------------------------------|--------------------------------|
| `api/src/PersonalFinance.Api/appsettings.json`           | Default API config             |
| `api/src/PersonalFinance.Api/appsettings.Development.json`| Dev API config                 |
| `.env` / `.env.local` (front-end)    | Front-end env vars             |

## Key Environment Variables
| NAME                | Scope      | Required | Example                                 | Notes                |
|---------------------|------------|----------|-----------------------------------------|----------------------|
| CONNECTIONSTRINGS__DEFAULT | API        | Yes      | Host=localhost;Port=5432;...            | PostgreSQL conn str  |
| VITE_API_URL        | Front-end  | Yes      | http://localhost:7208                   | API base URL         |
<!-- TODO: add more as needed -->

# Quality Gates

- **Lint:** `npm run lint` (front-end, ESLint)
- **Format:** <!-- TODO: add formatter command/config -->
- **Test:** `dotnet test` (backend), <!-- TODO: add front-end test command -->
- **Coverage:** <!-- TODO: add coverage config/thresholds -->
- **Pre-commit:** <!-- TODO: add pre-commit hook info -->

# CI/CD Overview

<!-- TODO: add .github/workflows/ info if present -->
- Build/test on push/PR
- Artifacts: API publish output, front-end build
- Deploy: <!-- TODO: add deploy target info -->

# Security Posture (high-level)

- **Auth:** No user auth implemented (API is open by default)
- **Secrets:** Use env vars for DB credentials
- **Dependency scanning:** <!-- TODO: add info if present -->

# Observability (high-level)

- **Logs:** ASP.NET logging (see `appsettings.json`)
- **Health:** `/api/transactions/health` endpoint
- **Tracing/metrics:** <!-- TODO: add info if present -->

# Repo Signals Scanned

- `package.json`
- `vite.config.ts`
- `api/src/PersonalFinance.Api/Program.cs`
- `api/src/PersonalFinance.Api/Controllers/TransactionsController.cs`
- `api/src/PersonalFinance.Api/Controllers/CategoryRulesController.cs`
- `api/src/PersonalFinance.Persistence/AppDbContext.cs`
- `api/src/PersonalFinance.Persistence/Migrations/20250615130438_InitPersonalFinance.cs`
- `api/src/PersonalFinance.Api/appsettings.json`
- `api/src/PersonalFinance.Api/appsettings.Development.json`
- `eslint.config.js`
- `tailwind.config.ts`
- `postcss.config.js`
- `README.md`
- `src/api/transactionsApi.ts`
- `src/api/categoryRulesApi.ts`
- `api/tests/PersonalFinance.Tests/CategoryRuleServiceTests.cs`

# Troubleshooting

- **API won’t start:** Check DB connection string in `appsettings.Development.json`.
- **CORS errors:** Ensure API is running on port 7208 and front-end on 8080.
- **DB errors:** Run migrations or check PostgreSQL is running.
- **Port conflicts:** Change ports in `vite.config.ts` or API launch settings.

# FAQ

- **How do I add a new API endpoint?**
  - Add a controller in `api/src/PersonalFinance.Api/Controllers/`.
- **How do I add a new page?**
  - Add a file in `src/pages/` and update routing.
- **How do I run tests?**
  - `dotnet test` for backend. <!-- TODO: add front-end test info -->

# Glossary

- **CQRS:** Command Query Responsibility Segregation
- **EF Core:** Entity Framework Core ORM
- **DTO:** Data Transfer Object
- **MediatR:** .NET library for CQRS/mediator pattern
- **shadcn/ui:** React component library

---

See also: [Front-End Architecture](./Front-End.md) | [API/Backend Architecture](./API-backend.md)
