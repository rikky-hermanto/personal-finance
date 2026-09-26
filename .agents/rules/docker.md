# Codex container rules

Scope: Dockerfiles, compose, container startup, Supabase local services, monitoring,
and related environment/build configuration.

Inspect current `docker-compose.yml`, Dockerfiles, `supabase/config.toml`, and root
package scripts. Do not reuse the old three-container/.NET 9/EF auto-migration topology.
Supabase local services are managed by its CLI; compose also includes monitoring and
other services. Determine their actual dependencies and ports before acting.

Use `docker compose` V2. Inspect `docker compose ps` and health/logs before starting
or rebuilding only the needed services. Avoid automatically taking the whole stack
down. Use --build for changed container source when required.

Vite public environment values are baked into frontend builds; never use a service-role
secret there. Read `.env.example` for names without displaying secret values. Preserve
volumes, health checks, networks, and service dependencies. SQL migrations replace EF
startup migrations. Stop/down differs from destructive down -v or volume pruning;
the latter needs explicit authorization. Do not embed local database passwords into docs.
