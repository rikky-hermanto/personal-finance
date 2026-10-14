---
name: db-migrate
description: Create and verify Supabase SQL schema migrations (Postgres 17). Use for any database schema change — new table, column, index, RLS policy — or an explicitly requested migration apply. Not EF Core (removed in PF-S07).
---

# Database Migration (Supabase)

Persistence is Supabase/PostgREST. There is no EF Core, no DbContext, and no startup auto-migration. Every schema change is a SQL file.

## Step 1 — Read before writing

- `.claude/rules/backend.md` (entity conventions) and `supabase/config.toml`
- The latest few files in `supabase/migrations/` (naming, style, RLS pattern)
- The entity in `apps/api/src/PersonalFinance.Domain/Entities/` and any DTOs or clients that read the table

## Step 2 — Write the migration

Create `supabase/migrations/{yyyyMMddHHmmss}_{snake_description}.sql` with a unique timestamp later than the newest existing file (e.g. `20261013000001_add_budget_table.sql`).

- Make the smallest schema change. Include constraints, indexes, any backfill (ordered correctly), and an RLS policy and grants for new tables.
- Money columns are `numeric`, never float (FIN-01).
- Keep `[Column("snake_case")]` attributes on the entity in sync, and update DTOs and clients in the same change.
- **Never edit a migration that has already been applied.** Add a new one.
- State rollback limits, especially for destructive changes (drops, type narrowing).

## Step 3 — Apply (only what the user asked for)

| Goal | Command |
|---|---|
| Apply to the local stack | `npx supabase db push` (or `npx supabase migration up`) |
| Rebuild local from scratch | `npx supabase db reset` — **destroys local data**; only when explicitly asked |
| Remote project | Only with explicit authorization; confirm the target first |

Writing a migration does not authorize applying it remotely, resetting data, or dropping objects. Never print credentials.

## Step 4 — Verify

- Check the table or column in Studio (http://localhost:54323) or with `npx supabase db diff`.
- Run the affected backend tests (`cd apps/api && dotnet test`).
- If no database was available, say the migration is **unverified**. Don't claim it works because the file exists.

Report: the migration path, its intended effect, whether it was applied (and where), the checks run, and any rollout risks.
