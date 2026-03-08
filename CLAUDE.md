# Personal Finance — Claude Code Guide

## Architecture

Full-stack monorepo: React 18 + Vite frontend (`src/`) with .NET 9 Clean Architecture API (`api/`) and PostgreSQL 16, orchestrated via Docker Compose.

For detailed docs (read on demand — not auto-imported):
- [.github/copilot-instructions.md](.github/copilot-instructions.md) — NOTE: says ".NET 8" but project uses .NET 9
- [docs/API-endpoints.md](docs/API-endpoints.md) — all REST endpoints with curl examples
- [docs/API-backend.md](docs/API-backend.md) — backend architecture details
- [docs/Front-End.md](docs/Front-End.md) — frontend architecture details
- [SETUP.md](SETUP.md) — Docker and local setup

## Project Layout

```
src/                          # React 18 + Vite + TypeScript frontend
  api/                        # API client functions (plain fetch, no axios)
  components/                 # Business components + ui/ (shadcn/ui primitives)
  pages/                      # Route views (Index, NotFound)
  types/                      # TypeScript interfaces
  hooks/, lib/, utils/, data/ # Hooks, utilities, mock data
api/                          # .NET 9 backend (Clean Architecture)
  src/PersonalFinance.Api/           # Controllers, middleware, Program.cs
  src/PersonalFinance.Application/   # CQRS commands/handlers, services, validators, DTOs
  src/PersonalFinance.Domain/        # Entities, domain events (zero external deps)
  src/PersonalFinance.Infrastructure/# Bank parsers (BCA CSV, NeoBank PDF, Default CSV)
  src/PersonalFinance.Persistence/   # EF Core DbContext, migrations, DI registration
  tests/PersonalFinance.Tests/       # xUnit + Moq tests
api-go/                       # Experimental Go API (Gin) — not production
```

## Quick Commands

### Frontend
- Install: `npm install`
- Dev server: `npm run dev` (port 8080)
- Build: `npm run build`
- Lint: `npm run lint`

### Backend (.NET)
- Restore: `cd api && dotnet restore PersonalFinance.slnx`
- Build: `cd api && dotnet build PersonalFinance.slnx`
- Run API: `cd api && dotnet run --project src/PersonalFinance.Api`
- Run tests: `cd api && dotnet test`
- Single test: `cd api && dotnet test --filter "FullyQualifiedName~TestMethodName"`
- Add migration: `cd api && dotnet ef migrations add <Name> --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api`
- Apply migration: `cd api && dotnet ef database update --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api`

### Docker (full stack)
- Start all: `docker compose up --build`
- DB + API only: `docker compose up --build db api`
- DB only: `docker compose up db`
- Stop: `docker compose down`
- Reset DB: `docker compose down -v`
- View logs: `docker compose logs -f api`

## Ports & URLs

| Service    | Port | URL                        |
|------------|------|----------------------------|
| Frontend   | 8080 | http://localhost:8080       |
| .NET API   | 7208 | http://localhost:7208       |
| Go API     | 7209 | http://localhost:7209       |
| PostgreSQL | 5432 | personal_finance database  |
| Health     |      | http://localhost:7208/health|

## Environment Variables

- Frontend: `VITE_API_URL` (default: `http://localhost:7208`) — set in `.env`
- Backend: `ConnectionStrings__Default` — PostgreSQL connection string in `appsettings.Development.json` or Docker env

## Key Patterns

### Backend (.NET 9)
- **Clean Architecture**: Domain (no deps) → Application → Infrastructure/Persistence → Api
- **CQRS via MediatR**: Commands as `record` types implementing `IRequest<T>`, handlers in `Application/Commands/`
- **FluentValidation**: Validators in `Application/Validation/`, naming: `Create{Entity}CommandValidator`
- **Domain Events**: `INotification` classes in `Domain/Events/`, published via MediatR after `SaveChangesAsync`
- **Bank Parser Strategy**: `IBankStatementParser` implementations; `IBankIdentifier.IdentifyAsync()` detects bank from file content; longest-keyword-match categorization
- **EF Core**: Snake_case naming via `UseSnakeCaseNamingConvention()`. Tables: `transactions`, `category_rules`. Auto-migrate on startup in `Program.cs`
- **DI Registration**: Persistence uses `AddPersistence()` extension. Other services registered directly in `Program.cs`

### Frontend (React/TypeScript)
- **UI Theme**: Always apply `.claude/skills/data-oriented-theme/SKILL.md` when building any UI component, page, dashboard, or artifact — read it before starting any frontend work. Skip only if the user explicitly requests a different style (e.g., landing page, marketing, creative design).
- **Path alias**: `@/` maps to `./src` — always use it for imports
- **UI library**: shadcn/ui components in `src/components/ui/` — NEVER manually edit these files
- **API clients**: Plain `fetch` functions in `src/api/` — no axios
- **State**: React Query (`@tanstack/react-query`) for server state, `useState` for local state
- **Styling**: Tailwind CSS utility classes only, `cn()` from `@/lib/utils` for conditional merging
- **Forms**: react-hook-form + Zod for validation
- **Charts**: Recharts for data visualization
- **Routing**: react-router-dom v6, routes in `App.tsx`

## Testing

### E2E — Playwright (primary functional coverage)
- **Config:** `playwright.config.ts` — `baseURL: http://localhost:8080`, Chromium, auto-starts `npm run dev`
- **Tests:** `e2e/` — `health.spec.ts`, `dashboard.spec.ts`, `upload.spec.ts`, `category-rules.spec.ts`
- **Fixtures:** `e2e/fixtures/bca-sample.csv` — sample BCA CSV for upload tests

| Command | What |
|---------|------|
| `npm run e2e` | Run all E2E tests (headless) |
| `npm run e2e:ui` | Open Playwright UI mode (interactive) |
| `npx playwright test e2e/health.spec.ts` | Run a single spec |
| `npx playwright codegen http://localhost:8080` | Record new tests interactively |
| `npx playwright show-report` | Open last HTML report |

**Requires full stack running.** Either `docker compose up -d` (DB + API) or local `dotnet run` + `npm run dev`.
The `webServer` block auto-starts the Vite dev server if not already running.

### Backend — xUnit + Moq
- **Tests:** `api/tests/PersonalFinance.Tests/` — `UseInMemoryDatabase` per test class, `IDisposable` pattern
- **Run all:** `cd api && dotnet test`
- **Single test:** `cd api && dotnet test --filter "FullyQualifiedName~TestMethodName"`
- **Reference:** `Services/CategoryRuleServiceTests.cs` — canonical example
- Naming: `MethodName_Condition_ExpectedResult`

### Frontend unit tests — Vitest (not yet configured, PF-038)
- Will use Vitest + React Testing Library; tests alongside components as `*.test.tsx`

## Known Gotchas

- `.github/copilot-instructions.md` says ".NET 8" but project targets `net9.0` — always use .NET 9
- `src/types/Transaction.ts` uses `id: string` but API returns `id: number` — type mismatch
- No frontend tests exist yet
- No authentication — API is wide open
- CORS is hardcoded to `http://localhost:8080` only (in `Program.cs`)
- DB credentials are in `appsettings.Development.json` (not secret-managed)

## File Protection

- NEVER commit `.env` files with real credentials
- NEVER modify files in `src/components/ui/` (managed by `npx shadcn@latest add`)
- NEVER manually edit migration `Designer.cs` or `Snapshot.cs` files
- ALWAYS use `dotnet ef migrations add` for schema changes
- Use `docker compose` (V2 syntax), never `docker-compose` (V1)

## Current Phase

> **Last updated:** 2026-03-08

### Status: Cleanup Sprint (4/7 core done) → Ramp-Up started
- **Setup phase (PF-001–PF-008):** COMPLETE
- **Cleanup sprint (PF-027–PF-033 + extras):** IN PROGRESS
  - Done: PF-027, PF-030, PF-032, PF-033, PF-041 (Playwright E2E)
  - Ready: PF-028 (exception leaks), PF-029 (N+1), PF-031 (controller logic)
  - Backlog: PF-034–PF-040, PF-042 (test suites, bugs, MCP exploration)
- **Ramp-Up:** PF-009 (Hello LLM) — IN PROGRESS

### What's Working
- Full upload-preview-submit pipeline (BCA CSV, NeoBank PDF, Default CSV)
- 106 seeded category rules with longest-keyword-match
- Dashboard with aggregated stats, top categories, 6-month cash flow
- Docker Compose full-stack orchestration
- Kanban board UI with task detail modals (draggable, internal DB)
- Playwright E2E test infrastructure (PF-041 — `e2e/` with 4 spec files + BCA CSV fixture)

### What's Not Built Yet
- Python FastAPI AI service
- LLM integration (PF-009 in progress — first Anthropic API call)
- Wise/Superbank/Bank Jago parsers
- BankProfile entity, FX rate conversion
- Authentication

### Known Tech Debt (remaining)
- Application.csproj still references Persistence (Clean Arch violation — ARCH-01)
- N+1 queries in CategorizeAsync (PF-029)
- N+1 in SubmitTransactions: GetAllAsync() called per transaction (PF-039)
- ~100 lines business logic in controller (PF-031)
- Exception details leaked in HTTP 500 responses (PF-028)
- Dashboard cash flow ignores year/month query params (PF-040)
- TypeScript strict mode disabled
- Zero ILogger usage
- No backend handler/validator/parser/controller tests (PF-034–PF-037)
- No frontend tests (PF-038)
