---
title: Copilot Instructions & Solution Map
updated: 2025-09-15
toc: true
---

# Overview

Personal Finance is a full-stack, monorepo solution for managing and analyzing personal financial transactions. It features a modern React + Vite front-end with **two backend options**: a production-ready .NET 8 Web API and an alternative Go implementation. Both APIs share the same PostgreSQL database and support extensible rules for transaction categorization. The repo is organized by solution layers for clear separation of concerns and developer productivity.

**Monorepo layout:**

```
├── src/                # Front-end (React, Vite, TypeScript)
├── api/                # Backend Option 1: .NET API (Production)
│   └── src/
│       ├── PersonalFinance.Api/           # API project
│       ├── PersonalFinance.Application/   # Application logic
│       ├── PersonalFinance.Domain/        # Domain models
│       ├── PersonalFinance.Infrastructure/# Infra/services
│       └── PersonalFinance.Persistence/   # DB context/migrations
│   └── tests/             # Backend unit tests
├── api-go/             # Backend Option 2: Go API (Alternative)
│   ├── cmd/server/        # Application entry point
│   ├── internal/          # Domain, application, infrastructure layers
│   ├── pkg/               # Shared utilities
│   ├── configs/           # Configuration management
│   ├── migrations/        # Database migrations
│   └── tests/             # Test suites
├── public/              # Static assets
├── docs/                # Documentation
├── package.json         # Front-end config/scripts
├── vite.config.ts       # Vite config
├── tailwind.config.ts   # Tailwind CSS config
├── eslint.config.js     # Lint config
└── README.md            # Project info
```

# Architecture at a Glance

```mermaid
flowchart LR
    A[Client (React/Vite)] -->|REST| B{API Gateway}
    B -->|Option 1| C[.NET WebAPI]
    B -->|Option 2| D[Go API]
    C -->|EF Core| E[(PostgreSQL)]
    D -->|GORM| E
    C --> F[Background Services]
    D --> F
    C --> G[Category Rules Engine]
    D --> G
    C --> H[Health/Observability]
    D --> H
```

# What's in Each Layer

## Client Layer
- **Framework:** React 18, Vite, TypeScript
- **UI:** shadcn/ui, Tailwind CSS, Radix UI
- **Location:** `src/`, `vite.config.ts`

## API Layer - Option 1: .NET (Production)
- **Framework:** ASP.NET Core WebAPI (.NET 8)
- **Patterns:** MediatR, CQRS, FluentValidation
- **Location:** `api/src/PersonalFinance.Api/`
- **Application:** CQRS, business logic, MediatR handlers (`api/src/PersonalFinance.Application/`)
- **Domain:** Entities, value objects, rules (`api/src/PersonalFinance.Domain/`)
- **Persistence:** Entity Framework Core, migrations, PostgreSQL (`api/src/PersonalFinance.Persistence/`)
- **Infrastructure:** Parsers, external integrations (`api/src/PersonalFinance.Infrastructure/`)
- **Tests:** xUnit, Moq, in-memory DB (`api/tests/PersonalFinance.Tests/`)

## API Layer - Option 2: Go (Alternative)
- **Framework:** Gin, GORM
- **Patterns:** Clean Architecture, Repository pattern
- **Location:** `api-go/`
- **Entry Point:** `cmd/server/main.go`
- **Domain:** Entities, interfaces (`internal/domain/`)
- **Application:** Services, DTOs (`internal/application/`)
- **Infrastructure:** Database, repositories, parsers (`internal/infrastructure/`)
- **API Handlers:** HTTP handlers, middleware (`internal/interfaces/`)
- **Utilities:** Date/amount parsers, file utils (`pkg/utils/`)
- **Tests:** Unit and integration tests (`tests/`)

# Developer Quickstart

## Prerequisites
- Node.js >= 18.x
- npm >= 9.x
- PostgreSQL (local or Docker)
- **Choose one backend:**
  - .NET 8 SDK (for production .NET API)
  - Go 1.21+ (for alternative Go API)

## Install & Bootstrap
```sh
# Frontend dependencies
npm install

# Backend Option 1: .NET API
cd api/src/PersonalFinance.Api
dotnet restore
cd ../../..

# Backend Option 2: Go API
cd api-go
go mod download
cd ..
```

## Run (Dev)

### Option 1: Using .NET API (Recommended)
```sh
# Terminal 1: Frontend
npm run dev

# Terminal 2: .NET API
cd api/src/PersonalFinance.Api
dotnet run
```

### Option 2: Using Go API
```sh
# Terminal 1: Frontend
npm run dev

# Terminal 2: Go API
cd api-go
go run cmd/server/main.go
# Or use: .\run.ps1 (Windows) or ./scripts/run-dev.sh (Linux/Mac)
```

### Option 3: Using Node.js Stub (No Backend Install)
```sh
# Terminal 1: Frontend
npm run dev

# Terminal 2: Node.js Stub (health check only)
cd api-go
node stub-server.cjs
```

## Run (Production)
```sh
# Frontend
npm run build

# Backend Option 1: .NET API
cd api/src/PersonalFinance.Api
dotnet publish -c Release

# Backend Option 2: Go API
cd api-go
go build -o personal-finance-api cmd/server/main.go
```

# Environments & Configuration

| File                                 | Purpose                        |
|--------------------------------------|--------------------------------|
| `api/src/PersonalFinance.Api/appsettings.json`           | Default API config             |
| `api/src/PersonalFinance.Api/appsettings.Development.json`| Dev API config                 |
| `.env` / `.env.local` (front-end)    | Front-end env vars             |

## Key Environment Variables

### Frontend
| NAME                | Required | Example                                 | Notes                |
|---------------------|----------|-----------------------------------------|----------------------|
| VITE_API_URL        | Yes      | http://localhost:7208                   | API base URL         |

### .NET API
| NAME                        | Required | Example                                 | Notes                |
|-----------------------------|----------|-----------------------------------------|----------------------|
| ConnectionStrings__Default  | Yes      | Host=localhost;Port=5432;Database=...   | PostgreSQL conn str  |

### Go API
| NAME                        | Required | Example                                 | Notes                |
|-----------------------------|----------|-----------------------------------------|----------------------|
| PF_DATABASE_HOST            | Yes      | localhost                               | PostgreSQL host      |
| PF_DATABASE_PORT            | Yes      | 5432                                    | PostgreSQL port      |
| PF_DATABASE_USER            | Yes      | postgres                                | Database user        |
| PF_DATABASE_PASSWORD        | Yes      | postgres123                             | Database password    |
| PF_DATABASE_NAME            | Yes      | personal_finance                        | Database name        |
| PF_SERVER_PORT              | No       | 7208                                    | API server port      |
| PF_SERVER_CORS_ALLOWED_ORIGINS | No    | http://localhost:8080                   | CORS origins         |

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

## Frontend
- `package.json`
- `vite.config.ts`
- `eslint.config.js`
- `tailwind.config.ts`
- `postcss.config.js`
- `README.md`
- `src/api/transactionsApi.ts`
- `src/api/categoryRulesApi.ts`

## .NET API
- `api/src/PersonalFinance.Api/Program.cs`
- `api/src/PersonalFinance.Api/Controllers/TransactionsController.cs`
- `api/src/PersonalFinance.Api/Controllers/CategoryRulesController.cs`
- `api/src/PersonalFinance.Persistence/AppDbContext.cs`
- `api/src/PersonalFinance.Persistence/Migrations/20250615130438_InitPersonalFinance.cs`
- `api/src/PersonalFinance.Api/appsettings.json`
- `api/src/PersonalFinance.Api/appsettings.Development.json`
- `api/tests/PersonalFinance.Tests/CategoryRuleServiceTests.cs`

## Go API
- `api-go/go.mod`
- `api-go/cmd/server/main.go`
- `api-go/README.md`
- `api-go/QUICKSTART.md`
- `api-go/INSTALL-GO.md`
- `api-go/stub-server.cjs`
- `api-go/.env.example`
- `api-go/configs/config.example.yaml`
- `api-go/docker-compose.yml`
- `api-go/Dockerfile`

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

See also: [Front-End Architecture](../docs/Front-End.md) | [API/Backend Architecture](../docs/API-backend.md)
