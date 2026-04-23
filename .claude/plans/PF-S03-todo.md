# PF-S03 — Seed category rules + basic RLS setup

> **GitHub Issue:** [#66](https://github.com/rikky-hermanto/personal-finance/issues/66)
> **Status:** Done ✅
> **Phase:** 1 — Supabase Setup + Schema Migration (last Phase 1 task)

## Current state (what PF-S02 already did)

| Artifact | State |
|----------|-------|
| `supabase/seed.sql` | ✅ 106 `INSERT INTO category_rules` rows + `setval` sequence reset |
| `supabase/migrations/20260101000000_initial_schema.sql` | ✅ DDL-only, pgvector, no INSERT rows |
| `supabase/config.toml` `[db.seed]` | ✅ `sql_paths = ["./seed.sql"]` already wired |

**What still needs doing:** RLS migration + AppDbContext cleanup. Nothing in seed.sql needs to change.

---

## TODO

### STEP 1 — Create RLS migration

Create a new file:
```
supabase/migrations/20260101000001_rls_setup.sql
```

Content:
```sql
-- Enable RLS on both tables.
-- Policies are permissive (USING (true)) until Auth is added in PF-S08.
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_transactions"
    ON transactions FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "allow_all_category_rules"
    ON category_rules FOR ALL
    USING (true)
    WITH CHECK (true);
```

> **Why two separate policies?** Supabase requires explicit `WITH CHECK` alongside `USING` for INSERT/UPDATE operations, otherwise those operations will be blocked by RLS even with a permissive policy.

> **Why permissive now?** RLS must be enabled before Auth policies can reference `auth.uid()` in PF-S08. Permissive policies keep the existing app working with no auth while RLS is technically active.

---

### STEP 2 — Remove HasData() from AppDbContext

Open [apps/api/src/PersonalFinance.Persistence/AppDbContext.cs](apps/api/src/PersonalFinance.Persistence/AppDbContext.cs).

In `OnModelCreating`, find the `entity.HasData(...)` block inside the `CategoryRule` configuration (lines 42–149) and delete it entirely. Keep the property config above it (`entity.HasKey`, `entity.Property` calls).

After removal, the `CategoryRule` configuration block should look like:
```csharp
modelBuilder.Entity<CategoryRule>(entity =>
{
    entity.ToTable("category_rules");
    entity.HasKey(c => c.Id);
    entity.Property(c => c.Id).ValueGeneratedOnAdd();
    entity.Property(c => c.Keyword).HasMaxLength(100);
    entity.Property(c => c.Type).HasMaxLength(50);
    entity.Property(c => c.Category).HasMaxLength(100);
});
```

> **Why remove it?** EF Core's `HasData()` would re-insert seed rows on every `dotnet ef database update`. Now that Supabase owns seeding via `seed.sql`, keeping `HasData()` risks duplicate row errors if anyone runs the legacy EF migration path.

---

### STEP 3 — Verify with supabase db reset

```bash
# From repo root
supabase db reset
```

Expected output:
- Migrations apply in order: `20260101000000_initial_schema.sql` → `20260101000001_rls_setup.sql`
- Seed runs: `seed.sql`
- No errors

Then open Supabase Studio at http://localhost:54323/project/default/editor and verify:
- `transactions` table exists — RLS badge shown (lock icon in Studio)
- `category_rules` table exists — RLS badge shown
- `category_rules` has exactly **106 rows**

---

## Acceptance Criteria (from issue #66)

- [x] `supabase/seed.sql` populated with all 106 `INSERT INTO category_rules` rows — **already done by PF-S02**
- [x] `supabase db reset` applies schema + seed and populates rules visible in Studio
- [x] RLS enabled on `transactions` and `category_rules` with permissive `USING (true)` policies
- [x] `AppDbContext.OnModelCreating` `HasData()` block removed

## Affected files

| File | Change |
|------|--------|
| `supabase/migrations/20260101000001_rls_setup.sql` | **Create** — RLS enable + permissive policies |
| `apps/api/src/PersonalFinance.Persistence/AppDbContext.cs` | **Edit** — delete `HasData()` block (lines 42–149) |

## What this unblocks

Completing PF-S03 closes Phase 1. Phase 2 can begin:
- **PF-S04** — Add `supabase-csharp` SDK + DI setup
- **PF-S05** — Annotate Domain entities for PostgREST
