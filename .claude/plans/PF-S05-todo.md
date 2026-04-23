# PF-S05 — Annotate Domain entities for Supabase PostgREST

> **GitHub Issue:** [#68](https://github.com/rikky-hermanto/personal-finance/issues/68)
> **Status:** Ready
> **Phase:** 2 — Replace EF Core with supabase-csharp
> **Depends on:** PF-S04 (Supabase NuGet must be installed before this compiles)

## Current state

| Artifact | State |
|----------|-------|
| `Transaction.cs` | Plain POCO — no attributes, no base class |
| `CategoryRule.cs` | Plain POCO — no attributes, computed `KeywordLength` property |
| `PersonalFinance.Domain.csproj` | Only `MediatR` package, no Postgrest |
| EF Core config | Fluent API in `AppDbContext.OnModelCreating` — NOT attributes on entities |

**Key insight:** Because EF Core model config is entirely in `AppDbContext` (fluent API), adding Postgrest attributes to the entity classes does **not** conflict with EF Core. Both systems can coexist until PF-S07 deletes Persistence.

---

## Column mapping reference

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

## TODO

### STEP 1 — Add `Supabase.Postgrest` to Domain project

Edit `apps/api/src/PersonalFinance.Domain/PersonalFinance.Domain.csproj`:

```xml
<ItemGroup>
  <PackageReference Include="MediatR" Version="12.5.0" />
  <PackageReference Include="Supabase.Postgrest" Version="4.1.0" />   <!-- add this line -->
</ItemGroup>
```

> **Why `Supabase.Postgrest` directly, not `Supabase`?** Domain should stay lean — no Storage, Auth, or Realtime clients. `Supabase.Postgrest` v4.1.0 is the exact transitive version already pulled by `Supabase` v1.1.1 (added to Infrastructure in PF-S04), so no version conflict.

---

### STEP 2 — Rewrite `Transaction.cs`

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

---

### STEP 3 — Rewrite `CategoryRule.cs`

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

> **`KeywordLength` setter reasoning:** When Postgrest deserializes a SELECT response, it calls the setter with the DB value. The setter discards it — the getter recomputes from `Keyword`, which is already deserialized (JSON property order is keyword before keyword_length in the DB schema). On INSERT/UPDATE, Postgrest serializes via the getter, which returns `Keyword.Length`, always matching the DB. The no-op setter is safe because the two values are invariantly equal.

---

### STEP 4 — Build verification

```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

Expected: **0 errors**.

Things to check if the build fails:
- `BaseModel` not found → PF-S04 not done yet (Supabase package not installed), or `Supabase.Postgrest` not added to Domain.csproj
- Attribute conflicts → unlikely, but check for any `using System.ComponentModel.DataAnnotations` imports (there are none currently)
- EF Core `OnModelCreating` still works → it uses fluent API, not attributes, so no interaction

---

## Affected files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Domain/PersonalFinance.Domain.csproj` | Add `Supabase.Postgrest` v4.1.0 |
| `apps/api/src/PersonalFinance.Domain/Entities/Transaction.cs` | Inherit `BaseModel`, add all `[Table]`/`[PrimaryKey]`/`[Column]` attributes |
| `apps/api/src/PersonalFinance.Domain/Entities/CategoryRule.cs` | Inherit `BaseModel`, add all attributes, clean up `KeywordLength` setter comment |

## What this unblocks

- **PF-S06** — Rewrite CQRS handlers — now that entities are annotated, `supabase.From<Transaction>()` queries will map correctly
