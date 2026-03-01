# Personal Finance — Claude Code Guide

## Architecture

Full-stack monorepo: React 18 + Vite frontend (`src/`) with .NET 9 Clean Architecture API (`api/`) and PostgreSQL 16, orchestrated via Docker Compose.

For detailed docs see:
- @.github/copilot-instructions.md (architecture overview — NOTE: references ".NET 8" but project uses .NET 9)
- @docs/API-endpoints.md (all REST endpoints with curl examples)
- @docs/API-backend.md (backend architecture details)
- @docs/Front-End.md (frontend architecture details)
- @SETUP.md (Docker and local setup)

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
- **Path alias**: `@/` maps to `./src` — always use it for imports
- **UI library**: shadcn/ui components in `src/components/ui/` — NEVER manually edit these files
- **API clients**: Plain `fetch` functions in `src/api/` — no axios
- **State**: React Query (`@tanstack/react-query`) for server state, `useState` for local state
- **Styling**: Tailwind CSS utility classes only, `cn()` from `@/lib/utils` for conditional merging
- **Forms**: react-hook-form + Zod for validation
- **Charts**: Recharts for data visualization
- **Routing**: react-router-dom v6, routes in `App.tsx`

## Known Gotchas

- `.github/copilot-instructions.md` says ".NET 8" but project targets `net9.0` — always use .NET 9
- `src/types/Transaction.ts` uses `id: string` but API returns `id: number` — type mismatch
- `WeatherForecastController.cs` and `WeatherForecast.cs` are scaffold leftovers — can be deleted
- `api/tests/PersonalFinance.Tests/UnitTest1.cs` is a template leftover — can be deleted
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
