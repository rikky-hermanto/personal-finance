---
description: Rules for Docker and container configuration
globs: docker-compose.yml,**/Dockerfile,nginx.conf,**/.dockerignore,supabase/config.toml
---

# Docker & Container Rules

## Topology (verify against `docker-compose.yml` before acting)

- **Supabase** (Postgres 17, Auth, Storage, Studio) runs via the Supabase CLI (`npx supabase start`), **not** compose. This is the real database.
- **Compose** holds: `db` (legacy `postgres:16-alpine`, kept only for the NpgSql health check / older flows), `api` (.NET 10, port 7208), `ai-service` (Python 3.12, port 8000), `frontend` (Node 20 build → nginx, host port 8080), and the monitoring stack `alloy`, `prometheus`, `loki`, `tempo`, `grafana` (3000).
- `npm start` starts Supabase + `db` + monitoring containers, then runs API, frontend, and AI service as **local processes**, not containers.
- There are **no EF Core startup migrations** (EF was removed in PF-S07). Schema changes are SQL files in `supabase/migrations/`.

## Rules

- Always `docker compose` (V2), never `docker-compose`.
- Check `docker compose ps` and health/logs first; start or rebuild only what the task needs. Use `--build` only when container source changed.
- `docker compose down -v`, volume removal, and pruning destroy data — only with explicit authorization. Plain `down`/`stop` is fine.
- Vite `VITE_*` values are baked into the frontend build at build time — never put a service-role key there.
- Read `.env.example` for variable names; never print secret values or hardcode DB passwords in docs.
- Preserve volumes, health checks, networks, and `depends_on` when editing compose.
