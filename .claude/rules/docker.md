---
description: Rules for Docker and container configuration
globs: docker-compose.yml,Dockerfile,api/Dockerfile,nginx.conf,.dockerignore,api/.dockerignore
---

# Docker & Container Rules

## Service Topology

| Service    | Image               | Container Port | Host Port | Healthcheck |
|------------|---------------------|----------------|-----------|-------------|
| `db`       | postgres:16-alpine  | 5432           | 5432      | pg_isready  |
| `api`      | .NET 9 multi-stage  | 7208           | 7208      | —           |
| `frontend` | Node 20 + Nginx     | 80             | 8080      | —           |

**Startup order:** `db` (with healthcheck) → `api` (depends on db healthy) → `frontend` (depends on api)

## Key Behaviors

- API auto-migrates EF Core on startup (`Program.cs`) — no manual migration step needed
- Frontend bakes `VITE_API_URL` at build time via Docker build arg
- PostgreSQL data persists in `postgres_data` named volume
- `docker compose down -v` **destroys the database volume** — use with caution

## Conventions

- Always use `docker compose` (V2 syntax), NEVER `docker-compose` (V1)
- Use `--build` flag when source code changed: `docker compose up --build`
- DB credentials: `postgres` / `postgres123` (dev only — never use in production)
- API environment: `ASPNETCORE_ENVIRONMENT=Development` in compose
- Container names: `personalfinance-db`, `personalfinance-api`, `personalfinance-frontend`

## Common Commands

```
docker compose up --build          # Start all with rebuild
docker compose up --build db api   # Start only DB + API
docker compose up db               # Start only DB (for local .NET dev)
docker compose down                # Stop all containers
docker compose down -v             # Stop + destroy DB volume
docker compose logs -f api         # Stream API logs
docker compose ps                  # Check service status
```
