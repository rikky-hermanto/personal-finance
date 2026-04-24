# PF-S05 — Annotate Domain entities for Supabase PostgREST

> **GitHub Issue:** [#68](https://github.com/rikky-hermanto/personal-finance/issues/68)
> **Status:** Ready
> **Phase:** 2 — Replace EF Core with supabase-csharp
> **Depends on:** PF-S04 (Supabase NuGet must be installed before this compiles)

## Objective

Prepare `Transaction` and `CategoryRule` domain entities to work with the supabase-csharp PostgREST client. Both entities are currently plain POCOs with no attributes. They must inherit `BaseModel` and carry `[Table]`, `[PrimaryKey]`, and `[Column]` attributes that match the Supabase schema created in PF-S02. This unblocks PF-S06, where CQRS handlers are rewritten to use `supabase.From<T>()` instead of EF Core `DbContext`.

## Acceptance Criteria

- [ ] `Supabase.Postgrest` v4.1.0 NuGet added to `PersonalFinance.Domain.csproj`
- [ ] `Transaction` inherits `Supabase.Postgrest.Models.BaseModel`
- [ ] `CategoryRule` inherits `Supabase.Postgrest.Models.BaseModel`
- [ ] Both entities annotated with `[Table]`, `[PrimaryKey]`, `[Column]` — all snake_case matching the DB
- [ ] `[PrimaryKey("id", shouldInsert: false)]` on both (identity column — never sent on INSERT)
- [ ] `dotnet build` passes with 0 errors — no attribute conflicts with EF Core

## Approach

Add `Supabase.Postgrest` directly to the Domain project (not the full `Supabase` package) to keep Domain lean — no Storage, Auth, or Realtime clients belong in Domain. `Supabase.Postgrest` v4.1.0 is the exact transitive version already pulled by `Supabase` v1.1.1 (added to Infrastructure in PF-S04), so no version conflict exists.

EF Core model config is entirely in `AppDbContext.OnModelCreating` (fluent API) — there are no EF attributes on the entity classes themselves, so adding Postgrest attributes does **not** conflict. Both systems can coexist until PF-S07 deletes Persistence.

Out of scope: rewriting handlers, changing queries, modifying controllers — those are PF-S06.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Domain/PersonalFinance.Domain.csproj` | Add `Supabase.Postgrest` v4.1.0 |
| `apps/api/src/PersonalFinance.Domain/Entities/Transaction.cs` | Inherit `BaseModel`, add `[Table]`/`[PrimaryKey]`/`[Column]` attributes |
| `apps/api/src/PersonalFinance.Domain/Entities/CategoryRule.cs` | Inherit `BaseModel`, add attributes, clean up `KeywordLength` setter comment |

---

## TODO

### [ ] STEP 1 — Add `Supabase.Postgrest` to Domain project

Edit `apps/api/src/PersonalFinance.Domain/PersonalFinance.Domain.csproj`:

```xml
<ItemGroup>
  <PackageReference Include="MediatR" Version="12.5.0" />
  <PackageReference Include="Supabase.Postgrest" Version="4.1.0" />   <!-- add this line -->
</ItemGroup>
```

> **Why `Supabase.Postgrest` directly, not `Supabase`?** Domain must stay lean — no Storage, Auth, or Realtime clients. Only the Postgrest model annotations belong here. `Supabase.Postgrest` v4.1.0 is a subset of what `Supabase` v1.1.1 pulls in (already in Infrastructure from PF-S04), so no version conflict.

---

### [ ] STEP 2 — Rewrite `Transaction.cs`

File: `apps/api/src/PersonalFinance.Domain/Entities/Transaction.cs`

```csharp
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("transactions")]
public class Transaction : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public int Id { get; set; }

    [Column("date")]
    public DateTime Date { get; set; }

    [Column("description")]
    public string Description { get; set; } = string.Empty;

    [Column("remarks")]
    public string Remarks { get; set; } = string.Empty;

    [Column("flow")]
    public string Flow { get; set; } = "DB";

    [Column("type")]
    public string Type { get; set; } = "Expense";

    [Column("category")]
    public string Category { get; set; } = "Untracked Category";

    [Column("wallet")]
    public string Wallet { get; set; } = string.Empty;

    [Column("amount_idr")]
    public decimal AmountIdr { get; set; }

    [Column("currency")]
    public string Currency { get; set; } = "IDR";

    [Column("exchange_rate")]
    public decimal? ExchangeRate { get; set; }
}
```

> **Why `shouldInsert: false` on Id?** The `id` column is an `integer IDENTITY` in Postgres — the DB auto-generates it on INSERT. Passing a value would either be silently ignored or cause a constraint violation. `shouldInsert: false` tells the Postgrest client to exclude this field from INSERT payloads.
>
> **Why no `[Column]` on fields that already match?** All C# property names are PascalCase; the DB columns are snake_case. Without explicit `[Column]` attributes, the Postgrest client cannot map them — every field needs the attribute.

---

### [ ] STEP 3 — Rewrite `CategoryRule.cs`

File: `apps/api/src/PersonalFinance.Domain/Entities/CategoryRule.cs`

```csharp
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("category_rules")]
public class CategoryRule : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public int Id { get; set; }

    [Column("keyword")]
    public string Keyword { get; set; } = string.Empty;

    [Column("type")]
    public string Type { get; set; } = string.Empty;

    [Column("category")]
    public string Category { get; set; } = string.Empty;

    [Column("keyword_length")]
    public int KeywordLength
    {
        get => string.IsNullOrEmpty(Keyword) ? 0 : Keyword.Length;
        set { /* DB value ignored — computed from Keyword; getter used on INSERT/UPDATE */ }
    }
}
```

> **Why the no-op setter on `KeywordLength`?** When Postgrest deserializes a SELECT response, it calls the setter with the DB value. The setter discards it — the getter recomputes from `Keyword`, which is already deserialized (JSON property order: `keyword` before `keyword_length`). On INSERT/UPDATE, Postgrest serializes via the getter, returning `Keyword.Length`, always matching the DB. The two values are invariantly equal, so discarding the DB value on read is safe.

---

### [ ] STEP 4 — Build verification

```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

Expected: **0 errors**.

> **Why verify the build here?** EF Core `OnModelCreating` still references these entities — if `BaseModel` adds any property that conflicts with EF's model (it doesn't, but worth confirming), you'll see a compile or runtime error. A clean build confirms both systems coexist correctly before PF-S06 starts rewriting handlers.
>
> **If build fails:**
> - `BaseModel` not found → PF-S04 not done, or `Supabase.Postgrest` not added to Domain.csproj
> - Attribute `[Table]` ambiguous → check for conflicting `using System.ComponentModel.DataAnnotations` (currently none, but verify)

---

## Column Mapping Reference

DB schema from `supabase/migrations/20260101000000_initial_schema.sql`:

### `transactions`

| C# Property | DB Column | DB Type | Notes |
|-------------|-----------|---------|-------|
| `Id` | `id` | `integer IDENTITY` | PrimaryKey, shouldInsert: false |
| `Date` | `date` | `timestamp with time zone` | |
| `Description` | `description` | `varchar(500)` | |
| `Remarks` | `remarks` | `varchar(500)` | |
| `Flow` | `flow` | `varchar(5)` | `"DB"` or `"CR"` |
| `Type` | `type` | `varchar(15)` | `"Expense"` or `"Income"` |
| `Category` | `category` | `varchar(100)` | |
| `Wallet` | `wallet` | `varchar(50)` | bank name |
| `AmountIdr` | `amount_idr` | `numeric` | |
| `Currency` | `currency` | `varchar(10)` | ISO 4217 |
| `ExchangeRate` | `exchange_rate` | `numeric` (nullable) | Wise only |

### `category_rules`

| C# Property | DB Column | DB Type | Notes |
|-------------|-----------|---------|-------|
| `Id` | `id` | `integer IDENTITY` | PrimaryKey, shouldInsert: false |
| `Keyword` | `keyword` | `varchar(100)` | |
| `Type` | `type` | `varchar(50)` | |
| `Category` | `category` | `varchar(100)` | |
| `KeywordLength` | `keyword_length` | `integer` | computed from `Keyword.Length` |

---

## Notes

- No EF Core attributes to remove — entities are currently plain POCOs with no `[Key]` or `[Column]` from `System.ComponentModel.DataAnnotations`
- `BaseModel` adds no visible public properties — it only provides internal ORM plumbing for the Postgrest client
- This task makes entities compatible with supabase-csharp without breaking EF Core (AppDbContext uses fluent API config, not attributes)
- **What this unblocks:** PF-S06 — Rewrite CQRS handlers — `supabase.From<Transaction>()` queries will map correctly once entities are annotated
