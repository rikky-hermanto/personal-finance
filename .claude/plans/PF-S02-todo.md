# PF-S02 — Migrate EF Core schema to Supabase SQL migrations

> **GitHub Issue:** #65  
> **Status:** Not Started / Ready  
> **Started:** TBD  

## Objective

Extract the current database schema defined by Entity Framework Core in the `.NET` Web API (`PersonalFinance.Infrastructure`) and translate it into raw SQL. This raw SQL will form the `001_initial_schema.sql` migration in our new Supabase-driven workflow, allowing us to drop Entity Framework Core entirely in upcoming phases without losing the structure of `transactions` and `category_rules`.

## Acceptance Criteria

- [ ] `dotnet ef migrations script` properly generates a pure SQL representation of our current database tables, types, and constraints
- [ ] SQL output saved as `supabase/migrations/[TIMESTAMP]_initial_schema.sql`
- [ ] Ensure that default behavior from `.NET` (like default date columns, Identity fields, primary keys, and foreign keys) translates cleanly to PostgreSQL standard DDL
- [ ] `pgvector` extension enablement is added to the top of the initial schema if not there by default
- [ ] Tested via `npx supabase db push` or resetting local db to ensure the migration passes against the Supabase internal PostgreSQL container

## Approach

We will execute `dotnet ef migrations script` targeting the `.NET API` application inside `apps/api/` in order to squeeze out the DDL. Then we will move that auto-generated SQL file into `supabase/migrations/`. Supabase parses this folder alphabetically/chronologically to manage the database schema. 

This guarantees a 1-to-1 data model layout map when modifying the application to use the `supabase-csharp` toolkit in later tickets because we used the exact same `.NET`-derived DDL to boot the initial Supabase schema.

Out of scope: RLS policies and seeder data (handled in `PF-S03`).

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/20260101000000_initial_schema.sql` | Create — DDL-only SQL dump of current EF schema (no INSERT data) |
| `supabase/seed.sql` | Create — 106 `category_rules` seed rows extracted from EF migration |

---

## Pre-flight Notes

- **`supabase/migrations/` does not exist yet** — must be created before running the `ef` command.
- **Seed data is baked into EF migrations** (`SeedCategoryRules` migration contains 106 INSERTs). The generated script will include them — strip the INSERT block from the migration file and move it to `supabase/seed.sql` instead. `config.toml` already points to `./seed.sql` for `db reset`.
- **`KeywordLength`** on `CategoryRule` is a computed property — EF ignores it, no column will appear in the output.

---

## TODO

### Phase 1 — Schema Translation

---

### STEP 1 — Create migrations folder and generate SQL from Entity Framework

```bash
mkdir -p supabase/migrations

cd apps/api
# -p points to Persistence (where AppDbContext lives), NOT Infrastructure
dotnet ef migrations script -p src/PersonalFinance.Persistence -s src/PersonalFinance.Api -o ../../supabase/migrations/20260101000000_initial_schema.sql
```

> **Why `PersonalFinance.Persistence`?**
> `AppDbContext` is defined in `Persistence`, not `Infrastructure`. Infrastructure only contains parsers. The `-p` flag must point to the project that owns the DbContext.

> **Why a timestamp prefix?**
> Supabase CLI uses 14-digit timestamps (`YYYYMMDDHHMMSS`) for migration ordering. Using `001_` deviates from convention and can cause ordering issues when mixing with future Supabase-generated migrations.

---

### STEP 2 — Strip seed data from migration, move to seed.sql

Open the generated `supabase/migrations/20260101000000_initial_schema.sql`. Find the block of `INSERT INTO category_rules` statements (106 rows from the `SeedCategoryRules` migration). Cut the entire INSERT block and paste it into a new file `supabase/seed.sql`.

The migration file should contain only DDL (`CREATE TABLE`, `CREATE INDEX`, etc.) — no `INSERT` rows.

> **Why separate?**
> Supabase separates schema (migrations) from seed data (`seed.sql`). `config.toml` already has `sql_paths = ["./seed.sql"]` under `[db.seed]`, so `supabase db reset` will apply schema migrations first, then seed automatically. Keeping INSERTs in the migration would double-insert on every reset.

---

### STEP 3 — Refine migration: add pgvector extension

Open `supabase/migrations/20260101000000_initial_schema.sql` and add this line to the very top (before any `CREATE TABLE`):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

> **Why?**
> PF-S13 depends on `pgvector` for AI-based semantic transaction matching. Adding it in the initial migration avoids a back-fill migration later.

---

### STEP 4 — Verify against local Supabase stack

```bash
# From repo root — ensure local Supabase stack is running
supabase start

# Apply migrations + seed
supabase db reset
```

> **Check:**
> Open Supabase Studio at `http://localhost:54323/project/default/editor` and verify:
> - `transactions` table exists with correct columns
> - `category_rules` table exists with correct columns
> - `category_rules` has 106 rows (from seed.sql)
---
