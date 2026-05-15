# PF-107 Phase 2 — Asset Class Delta + Auto-Pricing

> **Parent Issue:** PF-107 (Assets Management)
> **Phase:** 2 of 6 — First delight: auto-updating prices + "why did NW change?"
> **Status:** Not started
> **Depends on:** Phase 1B complete (all 5 asset tabs live, manual entry working)
> **Blocks:** Phase 3

## Objective

Deliver the first two "delight" features that reduce manual burden and answer the user's main analytical question. First: auto-pricing — crypto and gold start updating without user intervention; the JISDOR daily FX job means multi-currency accounts stay accurate automatically. Second: the Asset Class Delta chart, which decomposes month-over-month net worth change by asset class (e.g. "Cash −Rp 5M, Stocks +Rp 12M, Crypto +Rp 3M = NW +Rp 10M"). This directly mirrors the user's Excel habit of annotating monthly columns with notes like "BTC CL happening" or "AUD naik tajam" — it shows *what moved* without any cashflow coupling.

## Acceptance Criteria

- [ ] Background job (cron / Supabase Edge Function) runs daily and writes new `Valuation` rows for crypto assets via CoinGecko API
- [ ] Background job writes daily `Valuation` rows for gold assets using gold spot price feed
- [ ] Background job writes new `fx_rates` rows from JISDOR daily (USD, AUD, SGD, at minimum)
- [ ] `price_quotes` table populated with daily ticker prices for any `Holding` with `valuation_strategy = RealTime`
- [ ] Assets with `valuation_strategy = RealTime` show auto-updated values in the UI with a "Auto-updated" badge
- [ ] **Asset Class Delta chart** added to Overview — bar chart decomposing monthly NW Δ by asset class
- [ ] Recurring-valuation reminder appears on any asset/account whose latest `Valuation` is older than 30 days (configurable threshold)
- [ ] No external API keys hardcoded — all via environment variables
- [ ] Auto-pricing job failures are logged and do NOT crash the API (silent fail, last known price retained)

## Approach

Implement background jobs using .NET's `IHostedService` + `PeriodicTimer` pattern (already available in .NET 10, no Hangfire needed for daily cadence). CoinGecko free tier has a `/simple/price` endpoint with no API key for basic coins. Gold spot price from `metals.live` free API or goldapi.io free tier. Both write to the `price_quotes` table (cache) AND write a new `Valuation` row for each matching holding/asset with `source='price_feed'`. The Asset Class Delta chart is a pure frontend computation from two calls to `GET /api/networth/history` (current month vs previous month), grouped by asset class.

Out of scope: stock price feeds for IDX equities (fragile scraping — Phase 3), XIRR / returns (Phase 4), snapshot materialization (Phase 3).

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/NNNN_price_quotes.sql` | Create — `price_quotes` table if not created in Phase 1A |
| `apps/api/src/PersonalFinance.Application/Interfaces/IPricingService.cs` | Create |
| `apps/api/src/PersonalFinance.Infrastructure/Services/CoinGeckoPricingService.cs` | Create |
| `apps/api/src/PersonalFinance.Infrastructure/Services/GoldSpotPricingService.cs` | Create |
| `apps/api/src/PersonalFinance.Infrastructure/Jobs/DailyPricingJob.cs` | Create — `IHostedService` |
| `apps/api/src/PersonalFinance.Infrastructure/Jobs/DailyFxRateJob.cs` | Create — `IHostedService` |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Modify — register hosted services |
| `apps/frontend/src/components/assets/AssetClassDeltaChart.tsx` | Create |
| `apps/frontend/src/pages/assets/OverviewTab.tsx` | Modify — add AssetClassDeltaChart |
| `apps/frontend/src/api/netWorthApi.ts` | Modify — add `getNetWorthByClass(month)` endpoint |
| `apps/frontend/src/components/assets/ValuationStalenessReminder.tsx` | Create |

---

## TODO

### [ ] STEP 1 — Implement IPricingService + CoinGeckoPricingService

```csharp
// Application/Interfaces/IPricingService.cs
public interface IPricingService
{
    Task<PriceQuote?> GetPriceAsync(string ticker, string currency = "IDR", CancellationToken ct = default);
    Task RefreshPricesAsync(IEnumerable<string> tickers, CancellationToken ct = default);
}

// Infrastructure/Services/CoinGeckoPricingService.cs
// CoinGecko free tier: https://api.coingecko.com/api/v3/simple/price
// ?ids=bitcoin,ethereum,pax-gold&vs_currencies=idr
// No API key required for free tier (60 calls/min)
```

Map user's known tickers to CoinGecko IDs:

| Ticker | CoinGecko ID |
|--------|-------------|
| BTC | bitcoin |
| ETH | ethereum |
| PAXG | pax-gold |
| Any others | look up at coingecko.com/en/coins |

> **Why CoinGecko free tier instead of paid APIs?** The user has ~3-5 crypto assets. Free tier (60 req/min) is more than sufficient for a daily cron. Paid plan adds cost without benefit at this scale. If CoinGecko blocks the key-less endpoint in future, wrap the call in a try/catch and fail silently — manual entry is always available.

---

### [ ] STEP 2 — Implement GoldSpotPricingService

```csharp
// Infrastructure/Services/GoldSpotPricingService.cs
// metals.live free API: https://api.metals.live/v1/spot/gold
// Returns: [{ "gold": 3350.50 }] (USD/troy oz)
// Convert to IDR: gold_price_usd × troy_oz_held × fx_rate_usd_idr
```

> **Why troy oz?** International gold spot price is quoted in USD per troy ounce. The user's gold is likely stored as grams (Indonesian market convention). Conversion: 1 troy oz = 31.1035 grams. Store this conversion in `metadata.unit` on the gold Asset record so the pricing job can compute correctly.

---

### [ ] STEP 3 — Create DailyPricingJob (IHostedService)

```csharp
// Infrastructure/Jobs/DailyPricingJob.cs
public class DailyPricingJob(
    IServiceScopeFactory _scopeFactory,
    ILogger<DailyPricingJob> _logger
) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(24));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var pricingService = scope.ServiceProvider.GetRequiredService<IPricingService>();
                // 1. Query all Holdings with valuation_strategy = RealTime
                // 2. Call pricingService.RefreshPricesAsync(tickers)
                // 3. Write new Valuation rows with source='price_feed'
                _logger.LogInformation("Daily pricing job completed");
            }
            catch (Exception ex)
            {
                // Silent fail — manual values remain; job retries tomorrow
                _logger.LogError(ex, "Daily pricing job failed — retrying tomorrow");
            }
        }
    }
}
```

Register in `Program.cs`:
```csharp
builder.Services.AddHostedService<DailyPricingJob>();
builder.Services.AddHostedService<DailyFxRateJob>();
```

> **Why `IServiceScopeFactory` instead of injecting services directly?** `BackgroundService` is a singleton; `Supabase.Client` and `IPricingService` are scoped. Injecting scoped services into a singleton causes a scope-lifetime mismatch exception at startup. Create a new scope on each tick to get fresh scoped services.

---

### [ ] STEP 4 — Add backend endpoint for asset-class breakdown by month

Add to `NetWorthController`:

```
GET /api/networth/by-class?month=2026-04
```

Response:
```json
{
  "month": "2026-04",
  "classes": {
    "cash": 138734923,
    "investments": 927963092,
    "crypto": 154494343,
    "real_estate": 74000000,
    "receivables": 8000000
  },
  "total": 1229192359
}
```

Implementation: query `valuations` JOIN `accounts`/`assets`/`holdings` → filter to latest valuation per subject within the given month → group by `asset_class` → sum `value_idr`.

---

### [ ] STEP 5 — Build AssetClassDeltaChart frontend component

```tsx
// components/assets/AssetClassDeltaChart.tsx
// Horizontal stacked bar chart: one bar per asset class
// Green = positive delta, Red = negative delta
// Hover tooltip: "Investments: +Rp 12,4M (↑ 1.3%)"
// Uses Recharts BarChart with negative-value support
```

Fetch two months and compute delta client-side:
```typescript
const [thisMonth, lastMonth] = await Promise.all([
  getNetWorthByClass(format(new Date(), 'yyyy-MM')),
  getNetWorthByClass(format(subMonths(new Date(), 1), 'yyyy-MM'))
]);
const delta = Object.keys(thisMonth.classes).reduce((acc, cls) => {
  acc[cls] = (thisMonth.classes[cls] ?? 0) - (lastMonth.classes[cls] ?? 0);
  return acc;
}, {} as Record<string, number>);
```

> **Why compute delta on the frontend?** The delta is the difference of two existing API calls. Adding a dedicated `/api/networth/delta` endpoint would duplicate logic that's trivially computable from two existing responses. Keep the backend as a data layer; aggregations that depend on user's browsing context (which month range they're viewing) live on the frontend.

---

### [ ] STEP 6 — Add AssetClassDeltaChart to OverviewTab

```tsx
// In OverviewTab.tsx, below the existing 3-widget row:
<section>
  <h2 className="text-sm font-medium text-muted-foreground mb-3">
    Month-over-month movement
  </h2>
  <AssetClassDeltaChart />
</section>
```

---

### [ ] STEP 7 — Build ValuationStalenessReminder

```tsx
// components/assets/ValuationStalenessReminder.tsx
// Shows on AccountsTab / PropertiesTab for any item with
// last valuation > 30 days ago (configurable via Settings)
// Yellow banner: "Real estate 'Silangit' — last updated 87 days ago. Update?"
// Link opens AddValuationDialog directly
```

Backend: extend `GET /api/assets` to include `daysSinceLastValuation` in each item's response.

---

## Notes

- **CoinGecko rate limits**: Free tier allows 60 requests/min but may introduce rate limiting without API key. If blocked, add a 1-second sleep between ticker requests. Log response headers for `X-RateLimit-Remaining`.
- **First-run behaviour**: On first daily job execution after Phase 2 deploys, backfill the last 30 days of prices using CoinGecko's `/coins/{id}/market_chart` historical endpoint. One-time backfill avoids a gap in the trend chart.
- **Gold unit storage**: Store gold quantity in grams in `holdings.quantity` and set `metadata.unit = "gram"` on the Asset. The pricing job reads this and converts troy-oz spot price accordingly.
- **Auto-price badge in UI**: Show a `⚡ Auto` badge (using `--chart-3` token color) on any valuation row where `source='price_feed'`. This helps the user distinguish auto-populated from manually-entered values at a glance.
- **JISDOR timing**: JISDOR publishes rates around 10:00 WIB. Schedule `DailyFxRateJob` to run at 11:00 WIB (UTC+7 = 04:00 UTC) to guarantee today's rate is available.
