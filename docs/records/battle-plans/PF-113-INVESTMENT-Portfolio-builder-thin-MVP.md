# PF-113 — Portfolio Builder (Thin MVP)

## Context

Introduce a new top-level **INVESTMENT** section in the personal-finance app, sitting alongside Dashboard, Assets, and Cashflow in the sidebar. The PF-113 doc is a self-contained Claude artifact spec (single-file React, inline styles, `window.storage`, direct `api.anthropic.com` calls). We treat it as a **UX/PM spec**, not an implementation spec — the actual implementation reuses the existing app's stack (Tailwind + shadcn/ui + React Query + supabase-csharp + Python ai-service with `ProviderFactory`).

**Why thin MVP:** the spec is 4 screens, 7 analysis sections, snapshot history, compare view, 3 holdings-entry modes (manual / paste-extract / CSV), web search, and a 5-turn refine chat. We ship a **single end-to-end vertical slice** first — setup → manual holdings → one-shot analysis → render all 7 sections → persist snapshot — and validate the loop before layering on history, compare, paste-extract, CSV, refine, and web search in later slices.

**Why standalone first:** integration with Cashflow data (investable surplus, dividend detection, FX exposure) is the long-term differentiator, but it requires the Investment domain to exist first. We add the cross-feature wiring as a follow-up ticket (PF-114).

**Why "open to any AI model" is essentially free:** the existing Python ai-service already abstracts Gemini (primary) + Anthropic (alternate) via `ProviderFactory.create()`. A new `POST /portfolio-review` endpoint gets multi-provider for free — the frontend never talks to Anthropic directly, and the spec's broken model selector (which labels "Gemini-flash" with an "Opus 4.6" badge) is replaced with a clean provider dropdown wired to the same backend.

---

## Scope — Slice 1 (this plan)

**In:**
- New sidebar item **Investment** → routes under `/investment/*`
- One setup at a time, manual holdings entry only
- 8 archetypes (data lifted verbatim from PF-113 §4)
- 3-step wizard: Identity → Holdings (manual) → Review & run
- One-shot AI analysis through `services/ai-service` → render all 7 sections
- Persistence to Supabase: `investment_setups`, `investment_holdings`, `investment_snapshots`
- Setup list landing page

**Out (later slices):**
- Snapshot history, compare view
- Paste & Extract holdings mode
- CSV upload mode
- Web search tool
- Refine / follow-up chat
- Cashflow data integration

---

## Backend changes

### 1. Supabase migration

**New file:** `supabase/migrations/20260516000002_investment_portfolio.sql`

Three tables (RLS enabled with `USING (true)` placeholder, matching the post-PF-S07 pattern from `20260515000001_assets_management.sql`):

```sql
CREATE TABLE public.investment_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  archetype_id text NOT NULL,
  base_currency text NOT NULL DEFAULT 'IDR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.investment_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id uuid NOT NULL REFERENCES public.investment_setups(id) ON DELETE CASCADE,
  ticker text,
  name text NOT NULL,
  asset_class text NOT NULL,
  sector text,
  allocation_pct numeric(6,3),
  quantity numeric(20,8),
  avg_buy_price numeric(20,4),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_investment_holdings_setup ON public.investment_holdings(setup_id);

CREATE TABLE public.investment_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id uuid NOT NULL REFERENCES public.investment_setups(id) ON DELETE CASCADE,
  label text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  total_value numeric(20,2),
  currency text NOT NULL DEFAULT 'IDR',
  ai_provider text NOT NULL,
  ai_model text NOT NULL,
  analysis_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_investment_snapshots_setup ON public.investment_snapshots(setup_id, snapshot_date DESC);

-- RLS permissive placeholder pending PF-S08
ALTER TABLE public.investment_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_investment_setups" ON public.investment_setups USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_investment_holdings" ON public.investment_holdings USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_investment_snapshots" ON public.investment_snapshots USING (true) WITH CHECK (true);
```

Apply via `supabase db push`.

### 2. Domain entities

Mirror the pattern from [Asset.cs](apps/api/src/PersonalFinance.Domain/Entities/Asset.cs) — `BaseModel` + `[Table]` + `[PrimaryKey("id", shouldInsert: false)]` + `[Column("snake_case")]`.

- `apps/api/src/PersonalFinance.Domain/Entities/InvestmentSetup.cs`
- `apps/api/src/PersonalFinance.Domain/Entities/InvestmentHolding.cs`
- `apps/api/src/PersonalFinance.Domain/Entities/InvestmentSnapshot.cs` — `AnalysisJson` as `string?` (raw JSONB, same convention as `Asset.Metadata`)

### 3. DTOs

`apps/api/src/PersonalFinance.Application/Dtos/`:
- `InvestmentSetupDto.cs`
- `InvestmentHoldingDto.cs`
- `InvestmentSnapshotDto.cs`
- `PortfolioReviewRequestDto.cs` (setup + holdings + snapshotLabel + totalValue + currency + provider + model)
- `PortfolioReviewResponseDto.cs` (matches the 7-section schema from PF-113 §8)

### 4. Commands + handlers

Mirror [CreateAssetCommandHandler.cs](apps/api/src/PersonalFinance.Application/Commands/Assets/CreateAssetCommandHandler.cs) — primary-ctor injects `Supabase.Client`, `IValidator<T>`, `ILogger<>`; `await validator.ValidateAndThrowAsync(...)`; `supabase.From<T>().Insert(entity)`; return `result.Models.First()`.

`apps/api/src/PersonalFinance.Application/Commands/Investments/`:
- `CreateInvestmentSetupCommand[Handler|Validator].cs`
- `UpdateInvestmentSetupCommand[Handler|Validator].cs`
- `DeleteInvestmentSetupCommand[Handler].cs`
- `UpsertInvestmentHoldingsCommand[Handler|Validator].cs` — replace-all semantics for the setup's holdings (simpler than per-row CRUD for the wizard's Step 2)
- `RunPortfolioReviewCommand[Handler|Validator].cs` — pulls setup + holdings, calls `IPortfolioReviewClient`, persists `InvestmentSnapshot` with the returned JSON, returns the snapshot

### 5. Service + interface

- `apps/api/src/PersonalFinance.Application/Interfaces/IPortfolioReviewClient.cs` — single method `Task<PortfolioReviewResponseDto> ReviewAsync(PortfolioReviewRequestDto request, CancellationToken ct)`
- `apps/api/src/PersonalFinance.Infrastructure/External/PortfolioReviewClient.cs` — sibling to [LlmExtractionClient.cs](apps/api/src/PersonalFinance.Infrastructure/External/LlmExtractionClient.cs). Typed `HttpClient`, `JsonNamingPolicy.SnakeCaseLower`, posts to `/portfolio-review`, maps `502 UNAVAILABLE` → `LlmExtractionException(isTransient: true)`. Separate from `LlmExtractionClient` because the timeout (120s) and JSON shape differ enough — same rationale as `ILlmCategorizationClient` and `ILlmSuggestionClient` being separate.

Archetype catalogue lives in `apps/api/src/PersonalFinance.Application/Investments/ArchetypeCatalog.cs` as a static `IReadOnlyDictionary<string, Archetype>` — the same 8 records used by the frontend, sent to the AI in the prompt context. Single source of truth, exposed via `GET /api/investments/archetypes`.

### 6. Controller

`apps/api/src/PersonalFinance.Api/Controllers/InvestmentsController.cs` — mirror [AssetsController.cs](apps/api/src/PersonalFinance.Api/Controllers/AssetsController.cs):
- `GET    /api/investments/archetypes` — static catalogue
- `GET    /api/investments/setups` — list all
- `GET    /api/investments/setups/{id}` — single + holdings
- `POST   /api/investments/setups`
- `PUT    /api/investments/setups/{id}` (record-with for id)
- `DELETE /api/investments/setups/{id}`
- `PUT    /api/investments/setups/{id}/holdings` — upsert (replace-all)
- `POST   /api/investments/setups/{id}/review` — runs `RunPortfolioReviewCommand`, returns snapshot
- `GET    /api/investments/setups/{id}/snapshots/{snapshotId}` — fetch one snapshot's analysis JSON

Reads inline-Supabase, writes via `mediator.Send(...)` — matches the AssetsController pattern.

### 7. DI registration in `Program.cs`

Sibling block to the existing `AddHttpClient<ILlmExtractionClient, …>` registration:

```csharp
builder.Services.AddHttpClient<IPortfolioReviewClient, PortfolioReviewClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
    client.Timeout = TimeSpan.FromMinutes(2);
});
```

### 8. ai-service endpoint

Mirror the pattern from `services/ai-service/app/main.py` (`/parse-pdf` route) and `app/services/llm_parser.py`:

- `services/ai-service/app/services/portfolio_reviewer.py` — `REVIEW_SYSTEM_PROMPT` + `REVIEW_SCHEMA` co-located at module top. Schema is the full 7-section JSON from PF-113 §8. Uses `provider.extract_structured(system_prompt, user_text, schema)` so both Gemini (response_schema) and Anthropic (tool_use input_schema) work unchanged.
- `services/ai-service/app/models.py` — add `PortfolioReviewRequest` (archetype catalogue snippet, holdings list, snapshot label, total value, currency) and `PortfolioReviewResponse` (matches the 7 sections, all fields `Decimal` for numeric, `Literal` for enums per `.claude/rules/ai-service.md`).
- `services/ai-service/app/main.py` — register `app.state.portfolio_reviewer = PortfolioReviewer(provider)` in lifespan; add `@app.post("/portfolio-review", response_model=PortfolioReviewResponse)` route. Standard error mapping: `LlmParseError` → 502, `ProviderUnavailable` → 502, validation → 422.

**Prompt:** lift the analysis prompt template from PF-113 §8 verbatim, dropping the "Search for current prices" branch (web search is a later slice). Skip the "DEV/BALANCED/PREMIUM" model labels — the provider/model is chosen via the existing `AI_PROVIDER` env var or a new optional `provider`/`model` field on the request that overrides per-call.

---

## Frontend changes

### 1. Sidebar nav item

[apps/frontend/src/components/Sidebar.tsx](apps/frontend/src/components/Sidebar.tsx) — add to `menuItems` (lines 18–22):

```ts
{ id: 'investment', label: 'Investment', icon: TrendingUp, path: '/investment', matchPrefix: '/investment' },
```

Import `TrendingUp` from `lucide-react` (line 3).

### 2. Routes

[apps/frontend/src/App.tsx](apps/frontend/src/App.tsx) — add route group mirroring the Cashflow pattern at lines 47–55:

```tsx
<Route path="/investment" element={<InvestmentLayout />}>
  <Route index element={<InvestmentHome />} />
  <Route path="new" element={<InvestmentWizard />} />
  <Route path=":setupId" element={<InvestmentSetupDetail />} />
  <Route path=":setupId/review/:snapshotId" element={<InvestmentAnalysis />} />
</Route>
```

### 3. Pages

`apps/frontend/src/pages/investment/`:
- `InvestmentLayout.tsx` — thin shell with `<Outlet />`. No top tabs yet (single feature in this slice); structure mirrors [CashflowLayout.tsx](apps/frontend/src/pages/cashflow/CashflowLayout.tsx) without the Tabs component.
- `InvestmentHome.tsx` — setup list + empty state + "+ New setup" CTA. shadcn `Card`, `Button`.
- `InvestmentWizard.tsx` — 3-step state machine (`step: 1 | 2 | 3`). Internal state only; submit on Step 3 calls `createSetup` → `upsertHoldings` → `runReview`, then navigates to `/investment/:setupId/review/:snapshotId`. shadcn `Input`, `Select`, `Table`, `RadioGroup`, `Progress`.
- `InvestmentSetupDetail.tsx` — setup overview + holdings table + "Run new review" button (one-shot, no history list yet — coming in Slice 2).
- `InvestmentAnalysis.tsx` — renders the 7 sections from `analysis_json`. Sections 1 and 7 use Recharts (donut + horizontal bar) — replacing the spec's Chart.js CDN (which violates SEC-03). Everything else is plain shadcn primitives + Tailwind.

### 4. Components

`apps/frontend/src/components/investment/`:
- `ArchetypeCard.tsx` — single card for the wizard grid; selected-state styling.
- `ArchetypeDetail.tsx` — the tinted detail panel below the grid (thesis, metrics 2×2, score bars, tags, IDX context).
- `HoldingsManualTable.tsx` — editable shadcn Table for Step 2 manual entry.
- `analysis/` — one component per section (`DiagnosticsSection.tsx`, `HoldingsEvaluationSection.tsx`, `MacroMapSection.tsx`, `ScenariosSection.tsx`, `ResilienceSection.tsx`, `DecisionTreeSection.tsx`, `RecommendedPortfolioSection.tsx`).

### 5. API client

`apps/frontend/src/api/investmentApi.ts` — plain fetch, mirrors [transactionsApi.ts](apps/frontend/src/api/transactionsApi.ts). `BASE_URL = \`${API_BASE_URL}/api/investments\``. Functions: `listArchetypes`, `listSetups`, `getSetup`, `createSetup`, `updateSetup`, `deleteSetup`, `upsertHoldings`, `runReview`, `getSnapshot`.

### 6. React Query

Query keys: `['investment','archetypes']`, `['investment','setups']`, `['investment','setup',setupId]`, `['investment','snapshot',snapshotId]`. `staleTime: 60_000` for archetypes (static) and setups list; mutations invalidate the relevant keys. Errors bubble to the existing `ErrorBoundary` (App.tsx line 45) — no inline error handling, matching the project convention.

### 7. Archetype data

`apps/frontend/src/data/archetypes.ts` — 8 archetypes lifted verbatim from PF-113 §4. **However:** the backend's `GET /api/investments/archetypes` is the single source of truth that gets sent to the AI. The frontend file is for static rendering (color, glyph, tagline) and gets validated against the backend list at app start. If they drift, log a warning. Long-term we can drop the frontend copy and fetch on mount.

---

## Files modified or created (summary)

**Created:**
- `supabase/migrations/20260516000002_investment_portfolio.sql`
- `apps/api/src/PersonalFinance.Domain/Entities/InvestmentSetup.cs`, `InvestmentHolding.cs`, `InvestmentSnapshot.cs`
- `apps/api/src/PersonalFinance.Application/Dtos/InvestmentSetupDto.cs`, `InvestmentHoldingDto.cs`, `InvestmentSnapshotDto.cs`, `PortfolioReviewRequestDto.cs`, `PortfolioReviewResponseDto.cs`
- `apps/api/src/PersonalFinance.Application/Commands/Investments/*` (5 commands + validators)
- `apps/api/src/PersonalFinance.Application/Interfaces/IPortfolioReviewClient.cs`
- `apps/api/src/PersonalFinance.Application/Investments/ArchetypeCatalog.cs`
- `apps/api/src/PersonalFinance.Infrastructure/External/PortfolioReviewClient.cs`
- `apps/api/src/PersonalFinance.Api/Controllers/InvestmentsController.cs`
- `services/ai-service/app/services/portfolio_reviewer.py`
- `apps/frontend/src/pages/investment/*` (5 pages)
- `apps/frontend/src/components/investment/*` (3 wizard components + 7 analysis section components)
- `apps/frontend/src/api/investmentApi.ts`
- `apps/frontend/src/data/archetypes.ts`

**Modified:**
- `apps/api/src/PersonalFinance.Api/Program.cs` — register `IPortfolioReviewClient` typed HttpClient
- `services/ai-service/app/main.py` — register reviewer in lifespan + new route
- `services/ai-service/app/models.py` — add `PortfolioReviewRequest` / `PortfolioReviewResponse`
- `apps/frontend/src/components/Sidebar.tsx` — add menu entry
- `apps/frontend/src/App.tsx` — add `/investment/*` route group

---

## Verification

1. **Backend build & test**
   - `cd apps/api && dotnet build PersonalFinance.slnx`
   - `cd apps/api && dotnet test` — add at minimum one xUnit test per handler (canonical pattern: [CategoryRuleServiceTests.cs](apps/api/tests/PersonalFinance.Tests/Services/CategoryRuleServiceTests.cs)). Tests for `RunPortfolioReviewCommandHandler` mock `IPortfolioReviewClient`.

2. **Migration**
   - `supabase db push` — confirm 3 new tables exist via Studio at http://localhost:54323.

3. **ai-service**
   - `cd services/ai-service && pytest` — add a test for `portfolio_reviewer.py` that mocks the provider and asserts the response model parses.
   - Manual: `curl -X POST http://localhost:8000/portfolio-review -H "Content-Type: application/json" -d @sample-portfolio.json` — confirm a valid 7-section response.

4. **End-to-end happy path**
   - `npm start` (starts Supabase, LGTM, API, AI service, frontend).
   - Navigate to http://localhost:8080 → click **Investment** in sidebar → "+ New setup".
   - Step 1: name "Test Portfolio", currency IDR, pick **Balanced / Moderate** archetype, verify detail card renders.
   - Step 2: manually add 3 holdings (e.g. BBCA 40%, TLKM 30%, GOLD 30%), verify total bar turns green at 100%.
   - Step 3: snapshot label "May 2026 review", total value 100,000,000 IDR, click "Run portfolio review".
   - Confirm loading state renders, then the analysis page renders all 7 sections with charts.
   - Refresh — confirm setup + snapshot persisted (Supabase Studio shows rows).

5. **Provider switch**
   - Set `AI_PROVIDER=anthropic` in `.env`, restart ai-service, re-run review. Same UI, different provider.

6. **Lint / type-check**
   - `cd apps/frontend && npm run lint && npx tsc --noEmit`.

---

## TODO

Execute strictly in order — later steps depend on earlier ones. Each STEP is one logical commit.

### [x] STEP 1 — Create the Supabase migration

```bash
# from repo root
touch supabase/migrations/20260516000002_investment_portfolio.sql
# paste the SQL from "Backend changes → 1. Supabase migration" above
supabase db push
# verify in Studio: http://localhost:54323 → Tables → investment_setups, investment_holdings, investment_snapshots
```

> **Why:** Migration must land first because every C# entity in the next steps is validated against the live PostgREST schema at app startup (`supabase.InitializeAsync()` in `AddSupabase()`). If the table doesn't exist, the API won't boot. RLS uses the `USING (true)` placeholder so the wide-open API still functions until PF-S08 wires JWT auth.

---

### [x] STEP 2 — Add the three Domain entities

Create three files under `apps/api/src/PersonalFinance.Domain/Entities/`:
- `InvestmentSetup.cs`
- `InvestmentHolding.cs`
- `InvestmentSnapshot.cs`

```csharp
// canonical shape — match Asset.cs exactly
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("investment_setups")]
public class InvestmentSetup : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)] public Guid Id { get; set; }
    [Column("user_id")] public Guid UserId { get; set; }
    [Column("name")] public string Name { get; set; } = string.Empty;
    [Column("archetype_id")] public string ArchetypeId { get; set; } = string.Empty;
    [Column("base_currency")] public string BaseCurrency { get; set; } = "IDR";
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("updated_at")] public DateTime UpdatedAt { get; set; }
}
```

`InvestmentSnapshot.AnalysisJson` is `string?` (raw JSONB serialized client-side) — mirrors the `Asset.Metadata` convention.

> **Why:** All three entities must derive from `BaseModel` with snake_case `[Column]` attributes — that's how `supabase-csharp` round-trips PostgREST payloads. Forgetting `shouldInsert: false` on Id causes a 400 on INSERT because Postgres also tries to generate the uuid.

---

### [x] STEP 3 — Add the DTOs and the ArchetypeCatalog

Files under `apps/api/src/PersonalFinance.Application/`:
- `Dtos/InvestmentSetupDto.cs`, `InvestmentHoldingDto.cs`, `InvestmentSnapshotDto.cs`
- `Dtos/PortfolioReviewRequestDto.cs`, `PortfolioReviewResponseDto.cs` (the 7-section schema)
- `Investments/ArchetypeCatalog.cs` — static `IReadOnlyDictionary<string, Archetype>` with all 8 archetypes lifted verbatim from PF-113 §4 (id, label, color, glyph, tagline, thesis, risk, returnScore, timeHorizon, maxDD, targetReturn, maxPositions, rebalLabel, rebalRule, primaryTags, secondaryTags, idxContext)

> **Why:** DTOs live in `Application` per ARCH-03 (namespace must match physical layer). `ArchetypeCatalog` is in `Application` (not `Domain`) because it's a static reference dataset for handlers/AI, not a domain entity. Single source of truth — the frontend later validates against `GET /archetypes` to avoid drift.

---

### [x] STEP 4 — Write the commands, validators, and handlers

Create under `apps/api/src/PersonalFinance.Application/Commands/Investments/`:

| File | Purpose |
|---|---|
| `CreateInvestmentSetupCommand.cs` + `…Handler.cs` + `…Validator.cs` | `record(name, archetypeId, baseCurrency) : IRequest<InvestmentSetupDto>` |
| `UpdateInvestmentSetupCommand.cs` + handler + validator | `record(id, name, archetypeId, baseCurrency)` |
| `DeleteInvestmentSetupCommand.cs` + handler | `record(id) : IRequest<Unit>` (also cascades holdings + snapshots via FK) |
| `UpsertInvestmentHoldingsCommand.cs` + handler + validator | `record(setupId, holdings: List<InvestmentHoldingDto>)` — DELETE then INSERT all |
| `RunPortfolioReviewCommand.cs` + handler + validator | `record(setupId, label, totalValue?, currency, provider?, model?) : IRequest<InvestmentSnapshotDto>` |

Each handler mirrors `CreateAssetCommandHandler` — primary-ctor injects `Supabase.Client`, `IValidator<T>`, `ILogger<>`; calls `validator.ValidateAndThrowAsync` then `supabase.From<T>().Insert/Update/Delete`.

`RunPortfolioReviewCommandHandler` additionally injects `IPortfolioReviewClient` (built in STEP 5):
1. Fetch setup + holdings via Supabase.
2. Resolve archetype from `ArchetypeCatalog`.
3. Build `PortfolioReviewRequestDto`, call `client.ReviewAsync(...)`.
4. `JsonSerializer.Serialize` the response → `InvestmentSnapshot.AnalysisJson`.
5. Insert snapshot, return DTO.

> **Why:** Replace-all (delete+insert) on holdings keeps the wizard's Step 2 mental model simple — the user edits a full table and submits — and avoids per-row diff logic for this slice. We can optimize to per-row later if perf matters.

---

### [x] STEP 5 — Build the `IPortfolioReviewClient` typed HttpClient

Files:
- `apps/api/src/PersonalFinance.Application/Interfaces/IPortfolioReviewClient.cs` — one method `Task<PortfolioReviewResponseDto> ReviewAsync(PortfolioReviewRequestDto, CancellationToken)`
- `apps/api/src/PersonalFinance.Infrastructure/External/PortfolioReviewClient.cs` — sibling to `LlmExtractionClient`

```csharp
public class PortfolioReviewClient(HttpClient http, ILogger<PortfolioReviewClient> logger) : IPortfolioReviewClient
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    public async Task<PortfolioReviewResponseDto> ReviewAsync(PortfolioReviewRequestDto req, CancellationToken ct)
    {
        using var resp = await http.PostAsJsonAsync("/portfolio-review", req, Json, ct);
        if ((int)resp.StatusCode == 502)
            throw new LlmExtractionException("ai-service unavailable", isTransient: true);
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<PortfolioReviewResponseDto>(Json, ct))!;
    }
}
```

> **Why:** Sibling client (not adding to `LlmExtractionClient`) — same pattern as `ILlmCategorizationClient` and `ILlmSuggestionClient`. Timeouts differ (review = 120s, extraction = 60s) and the JSON shape is entirely different. Keeping concerns sharp also makes future replacement (e.g., switching review to an Azure-hosted endpoint) a one-class change.

---

### [x] STEP 6 — Register DI in `Program.cs`

Add next to the existing `AddHttpClient<ILlmExtractionClient, …>` block:

```csharp
builder.Services.AddHttpClient<IPortfolioReviewClient, PortfolioReviewClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
    client.Timeout = TimeSpan.FromMinutes(2);
});
```

MediatR + FluentValidation auto-discover handlers/validators via the existing assembly scan — no extra registration needed for the new commands.

> **Why:** `AddHttpClient<TInterface, TImpl>` gives us connection-pooling and per-call cancellation tokens for free. The 2-minute timeout matches the upper bound of a multi-asset review with web search disabled.

---

### [x] STEP 7 — Build the `InvestmentsController`

`apps/api/src/PersonalFinance.Api/Controllers/InvestmentsController.cs` — mirror `AssetsController.cs`. Reads inline via Supabase, writes via `mediator.Send`.

Routes:
- `GET    /api/investments/archetypes`
- `GET    /api/investments/setups`
- `GET    /api/investments/setups/{id}`
- `POST   /api/investments/setups`
- `PUT    /api/investments/setups/{id}` (use `command with { Id = id }`)
- `DELETE /api/investments/setups/{id}`
- `PUT    /api/investments/setups/{id}/holdings`
- `POST   /api/investments/setups/{id}/review`
- `GET    /api/investments/setups/{id}/snapshots/{snapshotId}`

```bash
cd apps/api && dotnet build PersonalFinance.slnx
# expected: 0 errors, 0 warnings
```

> **Why:** Controller actions stay ≤15 lines (ARCH-04). One controller hosts the whole sub-domain (setups + holdings + snapshots + the review proxy) — matches how `AssetsController` hosts assets + holdings + valuations.

---

### [x] STEP 8 — Extend `ai-service/app/models.py`

Add Pydantic v2 models:

```python
class PortfolioHolding(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    ticker: str | None = None
    name: str
    asset_class: Literal["equity","bond","crypto","forex","commodity","property","cash","other"]
    sector: str | None = None
    allocation_pct: Decimal | None = None
    quantity: Decimal | None = None
    avg_buy_price: Decimal | None = None

class PortfolioReviewRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    setup_name: str
    archetype: dict   # full archetype context block (thesis, tags, idx_context, …)
    snapshot_label: str
    total_value: Decimal | None = None
    currency: str = "IDR"
    holdings: list[PortfolioHolding]
    provider: str | None = None   # override AI_PROVIDER per-call
    model: str | None = None

class PortfolioReviewResponse(BaseModel):
    # 7 sections — diagnostics / holdings_evaluation / macro_map / scenarios / resilience_test / decision_tree / recommended_portfolio
    # Use Decimal for all numeric, Literal for all enums per .claude/rules/ai-service.md
    ...
```

> **Why:** `Decimal` (not `float`) for money is required by ai-service rules — IEEE 754 rounding silently corrupts allocation percentages when summed. Per-call `provider`/`model` override lets the future frontend dropdown switch models without restarting the service.

---

### [x] STEP 9 — Build the `PortfolioReviewer` service

`services/ai-service/app/services/portfolio_reviewer.py` — mirrors `llm_parser.py`:

```python
REVIEW_SYSTEM_PROMPT = """You are a senior portfolio strategist at a top-tier global investment firm...
(verbatim from PF-113 §8 main analysis system prompt)"""

REVIEW_SCHEMA = {  # the 7-section JSON schema from PF-113 §8
    "type": "object",
    "properties": { "diagnostics": {...}, "holdings_evaluation": {...}, ... },
    "required": ["diagnostics", "holdings_evaluation", "macro_map",
                 "scenarios", "resilience_test", "decision_tree", "recommended_portfolio"],
}

class PortfolioReviewer:
    def __init__(self, provider: LlmProvider):
        self._provider = provider

    async def review(self, req: PortfolioReviewRequest) -> PortfolioReviewResponse:
        user_text = build_user_prompt(req)   # archetype context + holdings table + instructions
        raw = await self._provider.extract_structured(REVIEW_SYSTEM_PROMPT, user_text, REVIEW_SCHEMA)
        return PortfolioReviewResponse.model_validate(raw)
```

> **Why:** Both providers consume the same `schema` dict — Gemini maps to `response_schema`, Anthropic to `tool_use` input_schema. Zero provider-specific code in the service. Prompt + schema stay co-located at module top, same as the parser pattern.

---

### [x] STEP 10 — Wire the route in `ai-service/app/main.py`

In the `lifespan` async context manager, add:

```python
app.state.portfolio_reviewer = PortfolioReviewer(provider)
```

Add the route:

```python
@app.post("/portfolio-review", response_model=PortfolioReviewResponse)
async def portfolio_review(req: PortfolioReviewRequest):
    try:
        return await app.state.portfolio_reviewer.review(req)
    except LlmParseError as e:
        raise HTTPException(status_code=502, detail={"code": "llm_parse_error", "message": str(e)})
    except ProviderUnavailable as e:
        raise HTTPException(status_code=502, detail={"code": "provider_unavailable", "message": str(e)})
```

```bash
cd services/ai-service && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/openapi.json | jq '.paths."/portfolio-review"'
```

> **Why:** Per-call exception → HTTPException mapping matches the contract documented in `.claude/rules/ai-service.md` (502 for LLM failures, never 200-with-empty). The .NET `PortfolioReviewClient` from STEP 5 only knows how to handle 502 + non-2xx — keeping the contract consistent across endpoints is the only way the typed clients stay simple.

---

### [x] STEP 11 — Add the frontend archetype data + nav entry + routes

Files:
- `apps/frontend/src/data/archetypes.ts` — 8 archetypes (color, glyph, tagline, …) for static rendering
- `apps/frontend/src/components/Sidebar.tsx` — add menu entry after Cashflow (line 21):
  ```ts
  { id: 'investment', label: 'Investment', icon: TrendingUp, path: '/investment', matchPrefix: '/investment' },
  ```
  Import `TrendingUp` from `lucide-react`.
- `apps/frontend/src/App.tsx` — add route group after the Cashflow group:
  ```tsx
  <Route path="/investment" element={<InvestmentLayout />}>
    <Route index element={<InvestmentHome />} />
    <Route path="new" element={<InvestmentWizard />} />
    <Route path=":setupId" element={<InvestmentSetupDetail />} />
    <Route path=":setupId/review/:snapshotId" element={<InvestmentAnalysis />} />
  </Route>
  ```

> **Why:** Nav + routes + static data first — gives a clickable skeleton that 404s gracefully while pages are being built. Lets you verify the sidebar active-state and the `matchPrefix` logic before any real page logic exists.

---

### [x] STEP 12 — Build the API client + React Query keys

`apps/frontend/src/api/investmentApi.ts` — plain fetch, mirrors `transactionsApi.ts`:

```ts
const BASE_URL = `${API_BASE_URL}/api/investments`;

export const listArchetypes  = () => fetch(`${BASE_URL}/archetypes`).then(r => r.json());
export const listSetups      = () => fetch(`${BASE_URL}/setups`).then(r => r.json());
export const getSetup        = (id: string) => fetch(`${BASE_URL}/setups/${id}`).then(r => r.json());
export const createSetup     = (body) => fetch(`${BASE_URL}/setups`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
export const upsertHoldings  = (id, holdings) => fetch(`${BASE_URL}/setups/${id}/holdings`, { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ holdings }) }).then(r => r.json());
export const runReview       = (id, body) => fetch(`${BASE_URL}/setups/${id}/review`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
export const getSnapshot     = (setupId, snapshotId) => fetch(`${BASE_URL}/setups/${setupId}/snapshots/${snapshotId}`).then(r => r.json());
```

Query keys: `['investment','archetypes']`, `['investment','setups']`, `['investment','setup', setupId]`, `['investment','snapshot', snapshotId]`. `staleTime: 60_000` for archetypes and setups list. Mutations invalidate.

> **Why:** Plain fetch (no axios) per the existing convention. Errors throw and bubble to the `ErrorBoundary` wrapping `AppShell` — no inline error UI matches the rest of the codebase.

---

### [x] STEP 13 — Build the wizard + landing pages

Under `apps/frontend/src/pages/investment/`:

| File | What |
|---|---|
| `InvestmentLayout.tsx` | Thin `<Outlet />` shell, page header "Investment" |
| `InvestmentHome.tsx` | `useQuery(['investment','setups'])` → empty state OR setup cards + `+ New setup` CTA → navigate to `/investment/new` |
| `InvestmentWizard.tsx` | 3-step state machine. Step 3 submit chain: `createSetup` → `upsertHoldings` → `runReview` → navigate to `/investment/:setupId/review/:snapshotId` |
| `InvestmentSetupDetail.tsx` | Setup overview + holdings table + "Run new review" button (single one-shot, no history yet) |
| `InvestmentAnalysis.tsx` | Loading state during the running mutation; output state renders the 7 sections (next step) |

Wizard local state shape:
```ts
type WizardState = {
  step: 1 | 2 | 3;
  name: string;
  baseCurrency: 'IDR' | 'USD' | 'SGD' | 'EUR' | 'JPY' | 'AUD' | 'GBP';
  archetypeId: string;
  holdings: HoldingRow[];
  snapshotLabel: string;
  totalValue: number | null;
}
```

> **Why:** Wizard state is local — no Redux/Zustand needed. The Step 3 → API chain ensures we never leave orphan setups (if `runReview` fails, the setup + holdings still exist and the user can retry via `InvestmentSetupDetail`).

---

### [x] STEP 14 — Build the analysis section components

Under `apps/frontend/src/components/investment/`:
- `ArchetypeCard.tsx`, `ArchetypeDetail.tsx`, `HoldingsManualTable.tsx` (wizard support)
- `analysis/DiagnosticsSection.tsx` — Recharts donut for sector concentration + asset class bars
- `analysis/HoldingsEvaluationSection.tsx` — shadcn Table with colored reco pills (HOLD/REDUCE/REPLACE/SELL)
- `analysis/MacroMapSection.tsx` — 2-column grid with directional arrows
- `analysis/ScenariosSection.tsx` — grid of cards color-coded by `portfolio_impact`
- `analysis/ResilienceSection.tsx` — SVG semicircle gauge + stress results table
- `analysis/DecisionTreeSection.tsx` — IF/THEN branches with nested children
- `analysis/RecommendedPortfolioSection.tsx` — horizontal Recharts bar (current vs target) + target allocation table + priority actions

> **Why:** Recharts (not Chart.js CDN) — already a project dependency, and the CDN approach in PF-113 §2 violates SEC-03 (no third-party CDN scripts). All other sections are plain Tailwind + shadcn — no chart lib needed.

---

### [x] STEP 15 — Add backend + ai-service tests

Backend (`apps/api/tests/PersonalFinance.Tests/`):
- `Commands/Investments/CreateInvestmentSetupCommandHandlerTests.cs` — happy path + validation failure
- `Commands/Investments/RunPortfolioReviewCommandHandlerTests.cs` — mock `IPortfolioReviewClient`, assert snapshot persisted with serialized JSON
- `Controllers/InvestmentsControllerTests.cs` — route smoke tests

AI service (`services/ai-service/tests/`):
- `test_portfolio_reviewer.py` — mock the provider's `extract_structured`, assert `PortfolioReviewResponse.model_validate` succeeds against a fixture JSON

```bash
cd apps/api && dotnet test --filter "FullyQualifiedName~Investment"
cd services/ai-service && pytest tests/test_portfolio_reviewer.py
```

> **Why:** TEST-01 mandates a test per handler and parser. We mock `IPortfolioReviewClient` to keep handler tests fast and offline — never call the real ai-service in CI. The Pydantic round-trip test catches schema drift between Python response and .NET DTO before it reaches integration testing.

---

### [x] STEP 16 — End-to-end smoke + commit

```bash
# from repo root
npm start            # starts Supabase + LGTM + .NET API + ai-service + frontend
```

Manual happy-path walkthrough:
1. Open http://localhost:8080 → click **Investment** in sidebar (active state highlights).
2. Empty state → click **+ New setup**.
3. Step 1 — name "Test Balanced Portfolio", currency IDR, select **Balanced / Moderate** archetype. Detail card renders with thesis, 2×2 metrics, score bars, tags, IDX context. Continue enabled.
4. Step 2 — manually add: BBCA 40%, TLKM 30%, GOLD 30%. Total bar turns green at 100%.
5. Step 3 — snapshot label "May 2026 review", total value `100000000`, click **Run portfolio review**.
6. Loading state renders 5-step progress; on success, navigate to analysis page.
7. All 7 sections render. Donut + bar charts populated.
8. Refresh page — analysis still renders (snapshot persisted). Open Supabase Studio → confirm rows in all 3 tables.
9. Set `AI_PROVIDER=anthropic` in `services/ai-service/.env`, restart ai-service, click **Run new review** from the setup detail. Same UI, different provider — works.

```bash
cd apps/frontend && npm run lint && npx tsc --noEmit
cd apps/api && dotnet build PersonalFinance.slnx
```

Then commit and open PR.

> **Why:** End-to-end smoke is the only way to catch contract drift between .NET DTOs (PascalCase) and Python models (snake_case) — unit tests on either side won't surface a missing field. The provider-switch step proves the "open to any AI model" goal works without code changes.

---

## Notes

- **Authentication is deferred.** All `UserId` columns are set to `Guid.Empty` and RLS policies are `USING (true)` — same pattern as Assets. PF-S08 will replace with JWT-derived user_id and tighten RLS in one sweep across all post-PF-S07 entities (tracked as PF-120 below).
- **No domain events fired** on Investment create/update — post-PF-S07 handlers stopped publishing events because there are no subscribers. If a downstream Cashflow integration later needs to react to setup changes, we'll add `InvestmentSetupCreatedEvent` then.
- **Archetype data lives in two places** (frontend `data/archetypes.ts` and backend `ArchetypeCatalog`). Backend is authoritative for AI calls; frontend copy is for static rendering speed. App-start validation logs a warning on drift. Acceptable for Slice 1; revisit if it causes bugs.
- **Recharts is preferred over Chart.js CDN** (SEC-03 forbids CDN scripts). Visual fidelity to PF-113 §6 is "close enough" — pixel parity is not a Slice 1 goal.
- **The PF-113 "model selector dropdown"** in the spec is not built in Slice 1 — provider is controlled by the `AI_PROVIDER` env var server-side. A frontend dropdown that posts `provider`/`model` override fields lands in a later slice (the request DTO already supports it).
- **Why 5 commands instead of fewer**: keeping Create/Update/Delete/UpsertHoldings/RunReview separate makes each one a ≤30-line handler with one clear responsibility — easier to test, easier to add `ILogger` calls later (ERR-02 / PF-051).

---

## Out-of-scope follow-ups (file as separate tickets)

- **PF-114** Investment ↔ Cashflow integration: investable surplus, dividend detection, FX exposure from Wise.
- **PF-115** Slice 2: snapshot history list + compare view (the diff table in PF-113 §HISTORY).
- **PF-116** Slice 2: Paste & Extract holdings mode (new `/extract-holdings` endpoint on ai-service).
- **PF-117** Slice 3: CSV upload with fuzzy column mapping.
- **PF-118** Slice 3: Web search tool (Anthropic `web_search_20250305` — gated to Anthropic provider).
- **PF-119** Slice 3: Refine / 5-turn follow-up chat.
- **PF-120** PF-S08 alignment: replace `Guid.Empty` `UserId` with JWT-derived user_id on Investment entities; tighten RLS policies.
