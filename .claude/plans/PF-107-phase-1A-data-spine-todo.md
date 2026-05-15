# PF-107 Phase 1A — Assets Management: Data Spine

> **Parent Issue:** PF-107 (Assets Management)
> **Phase:** 1A of 6 — Backend data layer only
> **Status:** Not started
> **Depends on:** PF-S07 (EF Core removal) ✅ done
> **Blocks:** Phase 1B (frontend can't start without API)

## Objective

Build the complete backend data layer for Assets Management as a **fully independent module** — no FKs to existing `transactions`, no changes to any existing parser or cashflow controller. Deliver 7 Supabase tables, C# domain entities, CQRS handlers, 4 REST controllers, and an FX rate service backed by Bank Indonesia's JISDOR feed. Phase 1A ships no visible UI change except one: enabling the previously-disabled "Banks & Accounts" placeholder in Settings. Everything else is invisible infrastructure. Phase 1B depends on this being solid.

## Acceptance Criteria

- [ ] Supabase migration applied — 7 new tables: `institutions`, `accounts`, `assets`, `holdings`, `valuations`, `liabilities`, `fx_rates`
- [ ] All tables have `user_id uuid NOT NULL` and permissive RLS (`USING (true)`) ready for PF-S08 flip
- [ ] `valuations` table has the FX quad-tuple: `value_native`, `currency`, `fx_rate_to_idr`, `value_idr`
- [ ] `assets` table has `valuation_strategy` enum: `RealTime | Algorithmic | Amortized | Manual`
- [ ] `liabilities` table has both `account_id?` and `asset_id?` FKs with a CHECK constraint enforcing mutual exclusivity
- [ ] 7 C# Domain entities created, all inherit `BaseModel`, all use snake_case `[Column]` attributes
- [ ] CQRS Create/Update/Delete commands + handlers for all 6 core entities (Institution, Account, Asset, Holding, Valuation, Liability)
- [ ] `IFxRateService` interface + `JisdorFxRateService` implementation wired in DI — fetches IDR rates from Bank Indonesia
- [ ] 4 REST controllers: `AccountsController`, `AssetsController`, `LiabilitiesController`, `NetWorthController`
- [ ] Settings "Banks & Accounts" tab enabled in frontend (replaces disabled placeholder)
- [ ] `dotnet test` passes — new handler unit tests for Create operations on each entity
- [ ] Manual verification: POST a `Valuation` with `currency=USD` → `value_idr` populated correctly via JISDOR
- [ ] `transactions` table is unchanged — no new columns, no new FKs, confirm via `supabase db diff`
- [ ] No changes to any existing parser, cashflow controller, or transaction API

## Approach

Follow the existing Supabase entity pattern established in PF-S05/S06: entities inherit `BaseModel` (supabase-csharp), use `[Table]`, `[PrimaryKey]`, `[Column]` attributes with snake_case names matching DB columns. CQRS pattern from existing commands in `Application/Commands/`. All 7 new tables live in `public` schema alongside existing tables — no separate schema needed. `IFxRateService` calls the JISDOR API (Bank Indonesia daily exchange rates endpoint) and caches results in the `fx_rates` table; fallback to fixer.io free tier if JISDOR unavailable.

Out of scope: auto-pricing jobs (Phase 2), UI beyond Settings tab (Phase 1B), any reconciliation with cashflow module, changes to existing parsers.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/NNNN_assets_management.sql` | Create — all 7 tables, enums, RLS policies |
| `apps/api/src/PersonalFinance.Domain/Entities/Institution.cs` | Create |
| `apps/api/src/PersonalFinance.Domain/Entities/Account.cs` | Create — NOT the same as cashflow wallet |
| `apps/api/src/PersonalFinance.Domain/Entities/Asset.cs` | Create — includes `valuation_strategy` enum |
| `apps/api/src/PersonalFinance.Domain/Entities/Holding.cs` | Create |
| `apps/api/src/PersonalFinance.Domain/Entities/Valuation.cs` | Create — FX quad-tuple fields |
| `apps/api/src/PersonalFinance.Domain/Entities/Liability.cs` | Create — `asset_id?` + `account_id?` mutual exclusion |
| `apps/api/src/PersonalFinance.Domain/Entities/PriceQuote.cs` | Create — placeholder, populated in Phase 2 |
| `apps/api/src/PersonalFinance.Application/Dtos/InstitutionDto.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Dtos/AccountDto.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Dtos/AssetDto.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Dtos/HoldingDto.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Dtos/ValuationDto.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Dtos/LiabilityDto.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Interfaces/IFxRateService.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Interfaces/INetWorthService.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Interfaces/IValuationService.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Commands/Institutions/` | Create — Create/Update/Delete commands + handlers |
| `apps/api/src/PersonalFinance.Application/Commands/Accounts/` | Create |
| `apps/api/src/PersonalFinance.Application/Commands/Assets/` | Create |
| `apps/api/src/PersonalFinance.Application/Commands/Holdings/` | Create |
| `apps/api/src/PersonalFinance.Application/Commands/Valuations/` | Create |
| `apps/api/src/PersonalFinance.Application/Commands/Liabilities/` | Create |
| `apps/api/src/PersonalFinance.Application/Validation/` | Create — validators per Create command |
| `apps/api/src/PersonalFinance.Infrastructure/Services/JisdorFxRateService.cs` | Create |
| `apps/api/src/PersonalFinance.Infrastructure/Services/NetWorthService.cs` | Create |
| `apps/api/src/PersonalFinance.Api/Controllers/AccountsController.cs` | Create |
| `apps/api/src/PersonalFinance.Api/Controllers/AssetsController.cs` | Create |
| `apps/api/src/PersonalFinance.Api/Controllers/LiabilitiesController.cs` | Create |
| `apps/api/src/PersonalFinance.Api/Controllers/NetWorthController.cs` | Create |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Modify — register new services |
| `apps/frontend/src/pages/settings/SettingsLayout.tsx` | Modify — un-disable `banks` tab |
| `apps/api/tests/PersonalFinance.Tests/Commands/` | Create — handler unit tests per entity |

---

## TODO

### [ ] STEP 1 — Check migration file numbering

```bash
ls supabase/migrations/
```

> **Why:** Migration files are numbered sequentially (e.g. `20250301000000_some_migration.sql`). The new file must have a timestamp later than all existing files or Supabase will apply them out of order. Note the highest existing timestamp and increment by 1 second minimum.

---

### [ ] STEP 2 — Create Supabase migration: enums + tables

Create `supabase/migrations/NNNN_assets_management.sql` with the full assets schema:

```sql
-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE public.asset_class AS ENUM (
  'cash', 'investments', 'fixed_income', 'crypto',
  'real_estate', 'tangibles', 'vehicles', 'receivables', 'retirement'
);

CREATE TYPE public.valuation_strategy AS ENUM (
  'RealTime', 'Algorithmic', 'Amortized', 'Manual'
);

CREATE TYPE public.valuation_source AS ENUM (
  'manual', 'price_feed', 'computed'
);

CREATE TYPE public.liability_type AS ENUM (
  'revolving', 'installment', 'personal'
);

-- ── institutions ──────────────────────────────────────────────────────────────
CREATE TABLE public.institutions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('bank','broker','crypto_exchange','insurer','other')),
  country     text NOT NULL DEFAULT 'ID',
  logo_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── accounts ─────────────────────────────────────────────────────────────────
CREATE TABLE public.accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  institution_id   uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  name             text NOT NULL,
  account_type     text NOT NULL CHECK (account_type IN
                     ('checking','savings','credit_card','brokerage','wallet','loan')),
  currency         text NOT NULL DEFAULT 'IDR',
  opening_balance  numeric(20,2) NOT NULL DEFAULT 0,
  opening_date     date NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  color            text,
  icon             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── assets ────────────────────────────────────────────────────────────────────
CREATE TABLE public.assets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  name                text NOT NULL,
  asset_class         public.asset_class NOT NULL,
  account_id          uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  acquired_date       date,
  acquisition_cost    numeric(20,2),
  currency            text NOT NULL DEFAULT 'IDR',
  valuation_strategy  public.valuation_strategy NOT NULL DEFAULT 'Manual',
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── holdings (fungible: MF units, stocks, crypto coins) ──────────────────────
CREATE TABLE public.holdings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ticker      text NOT NULL,
  quantity    numeric(30,10) NOT NULL DEFAULT 0,
  cost_basis  numeric(20,2) NOT NULL DEFAULT 0,
  currency    text NOT NULL DEFAULT 'IDR',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, ticker)
);

-- ── valuations (polymorphic time-series — the heart of the module) ────────────
CREATE TABLE public.valuations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  subject_type    text NOT NULL CHECK (subject_type IN ('account','asset','holding')),
  subject_id      uuid NOT NULL,
  value_native    numeric(30,2) NOT NULL,
  currency        text NOT NULL DEFAULT 'IDR',
  fx_rate_to_idr  numeric(20,6) NOT NULL DEFAULT 1,
  value_idr       numeric(30,2) NOT NULL,
  source          public.valuation_source NOT NULL DEFAULT 'manual',
  notes           text,
  valued_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_valuations_subject ON public.valuations (subject_type, subject_id, valued_at DESC);

-- ── liabilities ───────────────────────────────────────────────────────────────
CREATE TABLE public.liabilities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  name             text NOT NULL,
  liability_type   public.liability_type NOT NULL,
  account_id       uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  asset_id         uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  principal        numeric(20,2) NOT NULL,
  interest_rate    numeric(8,4),
  start_date       date NOT NULL,
  end_date         date,
  monthly_payment  numeric(20,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_liability_link CHECK (
    NOT (account_id IS NOT NULL AND asset_id IS NOT NULL)
  )
);

-- ── fx_rates cache (JISDOR daily) ────────────────────────────────────────────
CREATE TABLE public.fx_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_from  text NOT NULL,
  currency_to    text NOT NULL DEFAULT 'IDR',
  rate           numeric(20,6) NOT NULL,
  source         text NOT NULL DEFAULT 'jisdor',
  rate_date      date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (currency_from, currency_to, rate_date, source)
);

-- ── RLS (permissive until PF-S08 auth flip) ───────────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['institutions','accounts','assets','holdings',
                            'valuations','liabilities','fx_rates']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%s_open" ON public.%I USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
```

> **Why the FX quad-tuple on `valuations`?** Storing `value_native + currency + fx_rate_to_idr + value_idr` together means historical queries are fast (read `value_idr` directly, no join to `fx_rates`) AND historically honest — a USD valuation from 2024 keeps its 2024 exchange rate; it won't silently change if USD/IDR moves in 2026.
>
> **Why `CHECK NOT (account_id IS NOT NULL AND asset_id IS NOT NULL)` on liabilities?** A liability links to EITHER a cash account (e.g. credit card → checking account) OR a physical asset (e.g. mortgage → property asset). Never both simultaneously. The constraint is enforced at DB level so application code doesn't need to guard it.
>
> **Why the index on `valuations`?** Every balance query does `WHERE subject_type=X AND subject_id=Y ORDER BY valued_at DESC LIMIT 1` to get the latest value. Without this index, a full table scan on a multi-year history.

---

### [ ] STEP 3 — Apply migration and verify

```bash
supabase db push
```

Then open Supabase Studio at `http://localhost:54323` and verify:
- All 7 new tables exist under Table Editor
- `valuations` has `subject_type`, `subject_id`, `value_native`, `currency`, `fx_rate_to_idr`, `value_idr` columns
- `liabilities` has both `account_id` and `asset_id` columns
- `assets` has `valuation_strategy` column with enum values visible

> **Why verify in Studio before writing C#?** If the SQL has errors that Supabase silently ignores (e.g. enum type already exists), your C# models will mismatch the actual schema. Catch it here, not 2 hours into entity writing.

---

### [ ] STEP 4 — Create 7 C# Domain Entities

Create each entity in `apps/api/src/PersonalFinance.Domain/Entities/`. Pattern (follow existing entities for exact attribute style):

```csharp
// Institution.cs
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("institutions")]
public class Institution : BaseModel
{
    [PrimaryKey("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("type")]
    public string Type { get; set; } = string.Empty;  // bank|broker|crypto_exchange|insurer|other

    [Column("country")]
    public string Country { get; set; } = "ID";

    [Column("logo_url")]
    public string? LogoUrl { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
```

Repeat for: `Account.cs`, `Asset.cs` (add `ValuationStrategy` string property), `Holding.cs`, `Valuation.cs` (four value fields), `Liability.cs` (both `AccountId?` and `AssetId?`), `PriceQuote.cs`.

> **Why `BaseModel`?** supabase-csharp's `BaseModel` provides the PostgREST serialization/deserialization contract. Without it, `supabase.From<T>().Get()` doesn't know how to map column names. All existing entities in this project (`Transaction`, `CategoryRule`, `UploadedFile`) follow this exact pattern.

---

### [ ] STEP 5 — Create DTOs

Create in `apps/api/src/PersonalFinance.Application/Dtos/`. One DTO per entity — expose only what the API response should return (omit `UserId` from most, omit `CreatedAt` from create-request DTOs):

Files: `InstitutionDto.cs`, `AccountDto.cs`, `AssetDto.cs`, `HoldingDto.cs`, `ValuationDto.cs`, `LiabilityDto.cs`.

Include a `LiabilityDto` that computes a read-only `Ltv` property:
```csharp
// LiabilityDto.cs
public record LiabilityDto(
    Guid Id,
    string Name,
    string LiabilityType,
    Guid? AccountId,
    Guid? AssetId,
    decimal Principal,
    decimal? InterestRate,
    DateOnly StartDate,
    DateOnly? EndDate,
    decimal? MonthlyPayment,
    decimal? Ltv  // computed server-side: Principal / linked asset's latest value_idr
);
```

> **Why a DTO at all?** The Domain entity maps 1:1 to the DB row. The DTO is what the controller serializes to JSON. Keeping them separate means you can add computed fields (like `Ltv`) without polluting the entity with business logic, and you can evolve the API contract independently of the DB schema.

---

### [ ] STEP 6 — Create Service Interfaces

Create in `apps/api/src/PersonalFinance.Application/Interfaces/`:

```csharp
// IFxRateService.cs
public interface IFxRateService
{
    Task<decimal> GetRateToIdrAsync(string currencyFrom, DateOnly? date = null, CancellationToken ct = default);
    Task RefreshDailyRatesAsync(CancellationToken ct = default);
}

// IValuationService.cs
public interface IValuationService
{
    Task<Valuation?> GetLatestAsync(string subjectType, Guid subjectId, CancellationToken ct = default);
    Task<IReadOnlyList<Valuation>> GetHistoryAsync(string subjectType, Guid subjectId, CancellationToken ct = default);
}

// INetWorthService.cs
public interface INetWorthService
{
    Task<decimal> GetCurrentNetWorthIdrAsync(CancellationToken ct = default);
    Task<IReadOnlyDictionary<string, decimal>> GetAllocationByClassAsync(CancellationToken ct = default);
}
```

> **Why interfaces in `Application/Interfaces/` not in `Infrastructure/`?** ARCH-02 rule: interfaces are owned by the consuming layer (Application), implemented in the outer layer (Infrastructure). This keeps Application free of any dependency on Infrastructure — critical for testability.

---

### [ ] STEP 7 — Create CQRS Commands + Handlers

For each of the 6 entities (Institution, Account, Asset, Holding, Valuation, Liability), create the Create, Update, Delete command trio. Example pattern for Institution:

```csharp
// Application/Commands/Institutions/CreateInstitutionCommand.cs
public record CreateInstitutionCommand(
    string Name,
    string Type,
    string Country = "ID",
    string? LogoUrl = null
) : IRequest<Institution>;

// Application/Commands/Institutions/CreateInstitutionCommandHandler.cs
public class CreateInstitutionCommandHandler(
    Supabase.Client _supabase,
    IValidator<CreateInstitutionCommand> _validator
) : IRequestHandler<CreateInstitutionCommand, Institution>
{
    public async Task<Institution> Handle(CreateInstitutionCommand request, CancellationToken ct)
    {
        await _validator.ValidateAndThrowAsync(request, ct);

        var entity = new Institution
        {
            Id = Guid.NewGuid(),
            UserId = Guid.Empty,  // PF-S08 will wire real user_id from JWT
            Name = request.Name,
            Type = request.Type,
            Country = request.Country,
            LogoUrl = request.LogoUrl,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        var result = await _supabase.From<Institution>().Insert(entity);
        return result.Models.First();
    }
}
```

Validators go in `Application/Validation/CreateInstitutionCommandValidator.cs`. Minimum: `RuleFor(x => x.Name).NotEmpty()`.

Create the same pattern for Update (takes `Guid Id` + mutable fields) and Delete (takes only `Guid Id`).

> **Why `UserId = Guid.Empty` for now?** The auth middleware isn't wired yet (PF-S08). Setting it to `Guid.Empty` explicitly is a visible placeholder — when PF-S08 arrives, grep for `Guid.Empty` to find all handlers that need the JWT user_id injected. Don't skip it or the column will be null, which breaks the Phase 5 RLS flip.

---

### [ ] STEP 8 — Implement JisdorFxRateService

Create `apps/api/src/PersonalFinance.Infrastructure/Services/JisdorFxRateService.cs`:

```csharp
public class JisdorFxRateService(
    HttpClient _http,
    Supabase.Client _supabase,
    ILogger<JisdorFxRateService> _logger
) : IFxRateService
{
    // JISDOR endpoint: https://www.bi.go.id/biwebservice/wskursbi.asmx
    // Simpler public feed: https://api.bi.go.id/v1/jisdor (confirm availability)
    // Fallback: https://api.fixer.io/latest?base=USD&symbols=IDR (free tier, key required)

    public async Task<decimal> GetRateToIdrAsync(string currencyFrom, DateOnly? date = null, CancellationToken ct = default)
    {
        if (currencyFrom == "IDR") return 1m;

        var targetDate = date ?? DateOnly.FromDateTime(DateTime.UtcNow);

        // 1. Try cache first
        var cached = await _supabase.From<FxRate>()
            .Filter("currency_from", Supabase.Postgrest.Constants.Operator.Equals, currencyFrom)
            .Filter("rate_date", Supabase.Postgrest.Constants.Operator.Equals, targetDate.ToString("yyyy-MM-dd"))
            .Single();

        if (cached != null) return cached.Rate;

        // 2. Fetch from JISDOR
        // ... HTTP call implementation
        // 3. Cache result in fx_rates table
        // 4. Return rate
        throw new NotImplementedException("JISDOR fetch not yet implemented — wire HTTP call here");
    }
}
```

> **Why cache in `fx_rates` table?** JISDOR is rate-limited and only returns daily rates. Caching avoids repeated API calls and gives us historical rates for future backfill queries. The `UNIQUE (currency_from, currency_to, rate_date, source)` constraint prevents duplicate writes.

---

### [ ] STEP 9 — Create 4 REST Controllers

Create in `apps/api/src/PersonalFinance.Api/Controllers/`. Follow existing controller patterns (inject `IMediator`, `[ApiController]`, `[Route("api/[controller]")]`):

- `AccountsController` — CRUD for Institution + Account (grouped under one controller for settings UX)
- `AssetsController` — CRUD for Asset + Holding + Valuation
- `LiabilitiesController` — CRUD for Liability, GET includes computed `ltv`
- `NetWorthController` — GET `/api/networth/current` (total IDR), GET `/api/networth/allocation` (by asset class), GET `/api/networth/history?from=&to=` (time-series from `valuations`)

> **Why a dedicated `NetWorthController` instead of putting GET on `AssetsController`?** Net worth is a cross-entity aggregate — it queries across accounts, assets, holdings, and liabilities simultaneously. Keeping aggregation queries in their own controller makes it easier to add caching, separate permissions, and later a background job that writes to `daily_net_worth` (Phase 3).

---

### [ ] STEP 10 — Register DI in Program.cs

Add to `apps/api/src/PersonalFinance.Api/Program.cs`:

```csharp
// Assets module services
builder.Services.AddHttpClient<JisdorFxRateService>();
builder.Services.AddScoped<IFxRateService, JisdorFxRateService>();
builder.Services.AddScoped<IValuationService, ValuationService>();
builder.Services.AddScoped<INetWorthService, NetWorthService>();
```

> **Why?** Without DI registration, the constructor injection in controllers and handlers will throw `InvalidOperationException` at startup. Check: run `dotnet build` after registration — it will surface any missing registrations before you run the app.

---

### [ ] STEP 11 — Enable "Banks & Accounts" tab in Settings

In `apps/frontend/src/pages/settings/SettingsLayout.tsx`, find the disabled `banks` tab entry and enable it:

```tsx
// Before:
{ id: 'banks', label: 'Banks & Accounts', disabled: true }

// After:
{ id: 'banks', label: 'Banks & Accounts' }
```

Create a minimal `BanksTab.tsx` with a basic Institution list + "Add Institution" button that calls `POST /api/accounts` (AccountsController). Full CRUD UX is Phase 1B.

> **Why enable this in Phase 1A, not Phase 1B?** Phase 1A ships a working backend. The Settings tab is the only user-visible surface needed to seed data (add institutions/accounts) before the full `/assets/*` workspace arrives in Phase 1B. Without it, Phase 1A can't be manually verified end-to-end.

---

### [ ] STEP 12 — Write unit tests

Create `apps/api/tests/PersonalFinance.Tests/Commands/` with one test class per entity Create handler. Follow the `CategoryRuleServiceTests.cs` pattern: `UseInMemoryDatabase`, `IDisposable`, naming `MethodName_Condition_ExpectedResult`.

Minimum tests per entity:
- `Handle_ValidCommand_ReturnsCreatedEntity`
- `Handle_InvalidName_ThrowsValidationException`

```bash
cd apps/api && dotnet test
```

> **Why test now, before the UI?** Phase 1A is backend-only. If a handler has a bug, you want to catch it here — not after Phase 1B connects a UI and the symptom manifests as a confusing frontend error. The tests also serve as executable documentation of what each handler expects.

---

### [ ] STEP 13 — Manual verification: FX conversion

With the API running (`dotnet run --project src/PersonalFinance.Api`), POST a Valuation in USD:

```bash
curl -X POST http://localhost:7208/api/assets/valuations \
  -H "Content-Type: application/json" \
  -d '{
    "subjectType": "account",
    "subjectId": "<some-account-id>",
    "valueNative": 1000,
    "currency": "USD",
    "valuedAt": "2026-05-15T00:00:00Z",
    "source": "manual"
  }'
```

Expected: response contains `fxRateToIdr` (roughly 16000) and `valueIdr` ≈ 16,000,000. Verify the `fx_rates` cache table has a new row for `USD/IDR` dated today.

---

### [ ] STEP 14 — Verify transactions table is untouched

```bash
supabase db diff
```

Confirm the diff output shows **only** the 7 new assets tables and no changes to `transactions`, `category_rules`, `uploaded_files`, or `wallets`. This is the independence gate — if any existing table appears in the diff, investigate before merging.

---

## Notes

- **JISDOR endpoint**: Confirm the exact API URL before implementing `JisdorFxRateService`. The BI API has changed URLs before. If unavailable, use fixer.io free tier (`http://data.fixer.io/api/latest?access_key=KEY&base=EUR&symbols=IDR,USD,AUD,SGD`) — note fixer.io free tier has EUR as base only.
- **`UserId = Guid.Empty`**: Every handler sets this. When PF-S08 wires auth, do a global grep for `Guid.Empty` to find all the spots to update with `httpContextAccessor.HttpContext.User.GetUserId()`.
- **`account_type` check**: The `accounts` table has `wallet` as a valid `account_type`. This is the assets-module wallet (e.g. "Wise wallet") — completely distinct from `transactions.wallet` (string). Same word, different data.
- **Phase 1B dependency**: Phase 1B frontend can start once STEP 9 (controllers) and STEP 3 (migration applied) are done — the two teams can work in parallel if needed.
- **`PriceQuote` entity**: Create the C# entity and migration table now but leave it empty. Phase 2 will populate it via the auto-pricing background job. Having the table in the schema avoids a second migration for just one table.
