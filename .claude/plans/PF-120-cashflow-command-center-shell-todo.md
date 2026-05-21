# PF-120 — Cashflow Command Center: Shell + Deterministic Insights

> **GitHub Issue:** (create after plan approved)
> **Status:** To Do
> **Started:** 2026-05-21

## Objective

Replace the static `/cashflow/overview` surface (Net Cashflow card + Top Categories + YTD bar) with a personalized command center. The hero of the page becomes a vertical stack of typed insight cards computed deterministically from transaction history — no AI, no latency, no hallucination. Charts and existing widgets are demoted to a collapsible "Reference data" strip below. This ships the visual revolution before any AI work.

## Acceptance Criteria

- [x] `/cashflow/overview` renders DailyPulse headline → Cashflow Quests strip → InsightStack above existing widgets
- [x] Existing Net Cashflow / Top Categories / YTD chart remain functional inside a `<Collapsible>` labeled "Reference data" (collapsed by default)
- [x] All 6 deterministic insight types fire correctly when conditions are met (verified via unit tests with seeded txn lists)
- [x] Each InsightCard has a working dismiss button (session-scoped only — no server persistence in this phase)
- [x] DailyPulse shows a safe fallback message when <30 days of transaction history exist
- [x] Empty state renders when zero insights qualify — shows "Semua aman" message with link to Spend Pulse
- [x] All 6 detector unit tests pass: `dotnet test --filter "FullyQualifiedName~InsightServiceTests"`
- [ ] No regression in existing E2E specs: `npm run e2e`

## Approach

Build the backend first: a new `InsightService` with 6 pure-logic detectors that pull 90 days of transactions via the same `_supabase.From<Transaction>()` pattern used in `SpendingAnalysisService.cs`. Expose via a thin `InsightsController` (2 endpoints: GET insights, GET daily-pulse). Then wire the frontend: new React components (`DailyPulse`, `CashflowQuestStrip`, `InsightCard`, `InsightStack`) drop into `OverviewTab.tsx` above the existing row grid. Dismiss state lives in `useState` — no API call needed for Phase 1.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Application/Dtos/InsightDto.cs` | Create — DTO for a single insight card |
| `apps/api/src/PersonalFinance.Application/Dtos/DailyPulseDto.cs` | Create — DTO for the headline |
| `apps/api/src/PersonalFinance.Application/Interfaces/IInsightService.cs` | Create — service interface |
| `apps/api/src/PersonalFinance.Application/Services/InsightService.cs` | Create — 6 detectors + pulse generator |
| `apps/api/src/PersonalFinance.Api/Controllers/InsightsController.cs` | Create — 2 thin endpoints |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — register `IInsightService` |
| `apps/api/tests/PersonalFinance.Tests/Services/InsightServiceTests.cs` | Create — 6 detector unit tests |
| `apps/frontend/src/types/Insight.ts` | Create — TypeScript types |
| `apps/frontend/src/api/insightsApi.ts` | Create — 2 fetch functions |
| `apps/frontend/src/components/cashflow/DailyPulse.tsx` | Create — headline component |
| `apps/frontend/src/components/cashflow/CashflowQuestStrip.tsx` | Create — horizontal quest chips |
| `apps/frontend/src/components/cashflow/InsightCard.tsx` | Create — typed card with dismiss |
| `apps/frontend/src/components/cashflow/InsightStack.tsx` | Create — list + empty state |
| `apps/frontend/src/pages/cashflow/OverviewTab.tsx` | Edit — wire new components + collapsible |

---

## TODO

### [x] STEP 1 — Create DTOs

Create `apps/api/src/PersonalFinance.Application/Dtos/InsightDto.cs`:

```csharp
namespace PersonalFinance.Application.Dtos;

public record InsightDto(
    string Id,           // deterministic hash: "{Type}-{Category}-{Period}"
    string Type,         // statement_gap | habit_break | large_transaction | over_budget | under_budget
    string Severity,     // info | win | warning | alert | streak_break
    string Title,
    string Body,
    string? MetricLabel,
    decimal? MetricValue,
    string? Category,
    string? ActionType,  // navigate | null
    string? ActionTarget,
    DateTime ValidUntil
);
```

Create `apps/api/src/PersonalFinance.Application/Dtos/DailyPulseDto.cs`:

```csharp
namespace PersonalFinance.Application.Dtos;

public record DailyPulseDto(
    string Headline,
    string Tone,           // positive | neutral | caution
    decimal MonthProgress, // 0.0 – 1.0 (day of month / days in month)
    decimal? PaceVsBaseline // e.g. -0.12 = 12% below avg mid-month spending
);
```

> **Why:** Keeping DTOs as `record` types in `Application/Dtos/` follows ARCH-03 and the pattern set by `SafeToSpendDto`, `VarianceDriverDto`, etc. Using records gives structural equality for free which makes the unit tests cleaner.

---

### [x] STEP 2 — Create IInsightService interface

Create `apps/api/src/PersonalFinance.Application/Interfaces/IInsightService.cs`:

```csharp
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IInsightService
{
    Task<IReadOnlyList<InsightDto>> GetInsightsAsync(CancellationToken ct = default);
    Task<DailyPulseDto> GetDailyPulseAsync(CancellationToken ct = default);
}
```

> **Why:** Interface in `Application/Interfaces/` per ARCH-02. Implementation in `Application/Services/` because this service is pure analytics logic — no infrastructure dependency beyond Supabase (same layer as `SpendingAnalysisService` which follows the same pattern).

---

### [x] STEP 3 — Create InsightService with 6 detectors

Create `apps/api/src/PersonalFinance.Application/Services/InsightService.cs`:

```csharp
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Services;

public class InsightService(Supabase.Client supabase, ILogger<InsightService> logger) : IInsightService
{
    private static readonly HashSet<string> InvestmentKeywords = new(StringComparer.OrdinalIgnoreCase)
        { "Investment", "Stocks", "Saham", "Mutual Fund", "Reksa Dana", "SBN", "ORI", "Crypto", "P2P" };

    private static readonly HashSet<string> SavingsKeywords = new(StringComparer.OrdinalIgnoreCase)
        { "Savings", "Tabungan", "Dana Darurat", "Emergency Fund", "Saving" };

    public async Task<IReadOnlyList<InsightDto>> GetInsightsAsync(CancellationToken ct = default)
    {
        var today = DateTime.Today;
        var currentMonthStart = new DateTime(today.Year, today.Month, 1);
        var fetchStart = currentMonthStart.AddMonths(-3);

        logger.LogInformation("Generating insights: fetchStart={FetchStart} today={Today}", fetchStart, today);

        var transactions = await FetchTransactionsAsync(fetchStart, today);
        var current = transactions.Where(t => t.Date >= currentMonthStart).ToList();
        var trailing = transactions.Where(t => t.Date < currentMonthStart).ToList();
        var trailingMonths = Enumerable.Range(1, 3).Select(i => currentMonthStart.AddMonths(-i)).ToList();

        var insights = new List<InsightDto>();
        insights.AddRange(DetectStatementGaps(current, trailing, today));
        insights.AddRange(DetectHabitBreaks(current, trailing, trailingMonths, InvestmentKeywords, "investment"));
        insights.AddRange(DetectHabitBreaks(current, trailing, trailingMonths, SavingsKeywords, "savings"));
        insights.AddRange(DetectLargeTransactions(current, trailing, trailingMonths));
        insights.AddRange(DetectOverBudget(current, trailing, trailingMonths, today));
        insights.AddRange(DetectUnderBudget(current, trailing, trailingMonths, today));

        // Rank: alert/warning first, then streak_break, then win/info; cap at 10
        var ranked = insights
            .OrderBy(i => i.Severity switch
            {
                "alert"        => 0,
                "warning"      => 1,
                "streak_break" => 2,
                "win"          => 3,
                _              => 4
            })
            .Take(10)
            .ToList();

        logger.LogInformation("Generated {Count} insights", ranked.Count);
        return ranked;
    }

    public async Task<DailyPulseDto> GetDailyPulseAsync(CancellationToken ct = default)
    {
        var today = DateTime.Today;
        var currentMonthStart = new DateTime(today.Year, today.Month, 1);
        var fetchStart = currentMonthStart.AddMonths(-3);

        var transactions = await FetchTransactionsAsync(fetchStart, today);
        var current = transactions.Where(t => t.Date >= currentMonthStart && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).ToList();
        var trailing = transactions.Where(t => t.Date < currentMonthStart && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).ToList();

        var daysInMonth = DateTime.DaysInMonth(today.Year, today.Month);
        var dayOfMonth = today.Day;
        var monthProgress = (decimal)dayOfMonth / daysInMonth;

        if (!trailing.Any())
        {
            return new DailyPulseDto(
                "Selamat datang! Terus upload statement untuk mulai melihat insight personalmu.",
                "neutral", monthProgress, null);
        }

        var trailingMonths = Enumerable.Range(1, 3).Select(i => currentMonthStart.AddMonths(-i)).ToList();
        var trailingAvgTotal = trailingMonths
            .Select(m => trailing.Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month).Sum(t => t.AmountIdr))
            .DefaultIfEmpty(0m)
            .Average();

        var currentSpend = current.Sum(t => t.AmountIdr);
        var expectedPace = trailingAvgTotal * monthProgress;
        var paceRatio = expectedPace != 0 ? (currentSpend - expectedPace) / expectedPace : 0m;

        string headline;
        string tone;

        if (paceRatio < -0.15m)
        {
            headline = $"Pengeluaranmu bulan ini {Math.Abs(Math.Round(paceRatio * 100))}% di bawah rata-rata — bagus!";
            tone = "positive";
        }
        else if (paceRatio > 0.20m)
        {
            headline = $"Pengeluaranmu sudah {Math.Round(paceRatio * 100)}% di atas rata-rata bulan biasanya — hati-hati.";
            tone = "caution";
        }
        else
        {
            headline = "Pengeluaranmu bulan ini masih dalam kisaran normal — on track.";
            tone = "neutral";
        }

        return new DailyPulseDto(headline, tone, monthProgress, Math.Round(paceRatio, 3));
    }

    // ── Detectors ────────────────────────────────────────────────────────────

    private static IEnumerable<InsightDto> DetectStatementGaps(
        List<Transaction> current, List<Transaction> trailing, DateTime today)
    {
        var allTx = current.Concat(trailing).ToList();
        var cutoff = today.AddDays(-35);

        return allTx
            .GroupBy(t => t.Wallet)
            .Where(g => g.Max(t => t.Date) < cutoff)
            .Select(g => new InsightDto(
                $"statement_gap-{g.Key}",
                "statement_gap",
                "alert",
                $"{g.Key}: statement belum diupload",
                $"Data terakhir dari {g.Key} sudah lebih dari 35 hari yang lalu. Upload statement terbaru agar insight tetap akurat.",
                "Hari terakhir", (decimal)(today - g.Max(t => t.Date)).TotalDays,
                null, "navigate", "/cashflow/upload",
                DateTime.Today.AddDays(7)));
    }

    private static IEnumerable<InsightDto> DetectHabitBreaks(
        List<Transaction> current, List<Transaction> trailing,
        List<DateTime> trailingMonths, HashSet<string> keywords, string habitKey)
    {
        var hadHabitInTrailing = trailingMonths
            .Count(m => trailing.Any(t =>
                t.Date.Year == m.Year && t.Date.Month == m.Month &&
                keywords.Contains(t.Category ?? "")));

        if (hadHabitInTrailing < 2) yield break;

        var hasCurrentMonth = current.Any(t => keywords.Contains(t.Category ?? ""));
        if (hasCurrentMonth) yield break;

        var label = habitKey == "investment" ? "nabung/investasi saham" : "menabung";
        var title = habitKey == "investment"
            ? "Belum ada transaksi investasi bulan ini"
            : "Belum ada transfer tabungan bulan ini";
        var body = habitKey == "investment"
            ? "Kamu biasanya berinvestasi setiap bulan. Bulan ini belum ada. Cek apakah sudah terjadwal."
            : "Kamu biasanya menyisihkan tabungan setiap bulan. Bulan ini belum terdeteksi.";

        yield return new InsightDto(
            $"habit_break-{habitKey}",
            "habit_break",
            "streak_break",
            title, body,
            "Bulan berturut sebelumnya", hadHabitInTrailing,
            null, "navigate",
            habitKey == "investment" ? "/investment/overview" : "/assets/accounts",
            DateTime.Today.AddMonths(1).AddDays(-DateTime.Today.Day));
    }

    private static IEnumerable<InsightDto> DetectLargeTransactions(
        List<Transaction> current, List<Transaction> trailing, List<DateTime> trailingMonths)
    {
        var expenses = current.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).ToList();

        foreach (var cat in expenses.Select(t => t.Category).Distinct())
        {
            var monthlyAvg = trailingMonths
                .Select(m => trailing.Where(t =>
                    t.Date.Year == m.Year && t.Date.Month == m.Month &&
                    t.Category == cat && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
                    .Sum(t => t.AmountIdr))
                .DefaultIfEmpty(0m)
                .Average();

            if (monthlyAvg <= 0) continue;

            var largeOnes = expenses
                .Where(t => t.Category == cat && t.AmountIdr > monthlyAvg * 2m)
                .OrderByDescending(t => t.AmountIdr)
                .Take(1);

            foreach (var tx in largeOnes)
            {
                yield return new InsightDto(
                    $"large_tx-{cat}-{tx.Date:yyyyMMdd}",
                    "large_transaction",
                    "info",
                    $"Transaksi besar di {cat}",
                    $"{tx.Description} ({tx.Date:dd MMM}) senilai Rp {tx.AmountIdr:N0} — lebih dari 2× rata-rata bulananmu untuk kategori ini.",
                    "Rata-rata bulanan", monthlyAvg,
                    cat, null, null,
                    DateTime.Today.AddDays(14));
            }
        }
    }

    private static IEnumerable<InsightDto> DetectOverBudget(
        List<Transaction> current, List<Transaction> trailing,
        List<DateTime> trailingMonths, DateTime today)
    {
        if (today.Day < 15) yield break;

        var expenses = current.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).ToList();

        foreach (var cat in expenses.Select(t => t.Category).Distinct())
        {
            var monthlyAvg = trailingMonths
                .Select(m => trailing.Where(t =>
                    t.Date.Year == m.Year && t.Date.Month == m.Month &&
                    t.Category == cat && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
                    .Sum(t => t.AmountIdr))
                .DefaultIfEmpty(0m)
                .Average();

            if (monthlyAvg <= 100_000m) continue;

            var currentSpend = expenses.Where(t => t.Category == cat).Sum(t => t.AmountIdr);
            if (currentSpend <= monthlyAvg * 1.3m) continue;

            var pct = Math.Round((currentSpend - monthlyAvg) / monthlyAvg * 100);
            yield return new InsightDto(
                $"over_budget-{cat}",
                "over_budget",
                "warning",
                $"{cat} sudah melebihi rata-rata",
                $"Pengeluaran {cat} bulan ini Rp {currentSpend:N0}, sudah {pct}% di atas rata-rata 3 bulan terakhir (Rp {monthlyAvg:N0}).",
                "Di atas rata-rata", pct,
                cat, null, null,
                DateTime.Today.AddMonths(1).AddDays(-DateTime.Today.Day));
        }
    }

    private static IEnumerable<InsightDto> DetectUnderBudget(
        List<Transaction> current, List<Transaction> trailing,
        List<DateTime> trailingMonths, DateTime today)
    {
        var daysInMonth = DateTime.DaysInMonth(today.Year, today.Month);
        if (today.Day < daysInMonth - 3) yield break;

        var expenses = current.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).ToList();

        foreach (var cat in expenses.Select(t => t.Category).Distinct())
        {
            var monthlyAvg = trailingMonths
                .Select(m => trailing.Where(t =>
                    t.Date.Year == m.Year && t.Date.Month == m.Month &&
                    t.Category == cat && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
                    .Sum(t => t.AmountIdr))
                .DefaultIfEmpty(0m)
                .Average();

            if (monthlyAvg <= 200_000m) continue;

            var currentSpend = expenses.Where(t => t.Category == cat).Sum(t => t.AmountIdr);
            if (currentSpend >= monthlyAvg * 0.7m) continue;

            var saved = Math.Round(monthlyAvg - currentSpend);
            yield return new InsightDto(
                $"under_budget-{cat}",
                "under_budget",
                "win",
                $"Hemat di {cat} bulan ini!",
                $"Kamu menghemat sekitar Rp {saved:N0} di {cat} dibanding rata-rata. Bisa dialokasikan ke tabungan atau investasi.",
                "Dihemat bulan ini", saved,
                cat, "navigate", "/investment/overview",
                DateTime.Today.AddMonths(1).AddDays(-DateTime.Today.Day));
        }
    }

    // ── Shared fetch (same pattern as SpendingAnalysisService) ────────────────

    private async Task<List<Transaction>> FetchTransactionsAsync(DateTime start, DateTime end)
    {
        var all = new List<Transaction>();
        int pageSize = 1000;
        int offset = 0;
        bool hasMore = true;

        while (hasMore)
        {
            var result = await supabase.From<Transaction>()
                .Filter("date", Operator.GreaterThanOrEqual, start)
                .Filter("date", Operator.LessThanOrEqual, end)
                .Order("date", Ordering.Descending)
                .Range(offset, offset + pageSize - 1)
                .Get();

            all.AddRange(result.Models);
            if (result.Models.Count < pageSize) hasMore = false;
            else offset += pageSize;
        }

        return all;
    }
}
```

> **Why:** Mirrors the `SpendingAnalysisService.FetchTransactionsAsync` pagination pattern exactly — same Supabase PostgREST API, same offset loop, same `Operator` constants from `static Supabase.Postgrest.Constants`. All 6 detectors are private statics so they can be unit-tested by constructing data inline without needing a Supabase mock. Per ERR-02, ILogger is injected.

---

### [x] STEP 4 — Create InsightsController

Create `apps/api/src/PersonalFinance.Api/Controllers/InsightsController.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InsightsController(IInsightService insightService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<InsightDto>>> GetInsights(CancellationToken ct) =>
        Ok(await insightService.GetInsightsAsync(ct));

    [HttpGet("daily-pulse")]
    public async Task<ActionResult<DailyPulseDto>> GetDailyPulse(CancellationToken ct) =>
        Ok(await insightService.GetDailyPulseAsync(ct));
}
```

> **Why:** Primary constructor injection (same style as `JourneyController`). Two actions, each ≤5 lines — well within ARCH-04's 15-line limit. No business logic in the controller.

---

### [x] STEP 5 — Register DI in Program.cs

In `apps/api/src/PersonalFinance.Api/Program.cs`, after the existing `AddScoped` registrations (around line 108), add:

```csharp
builder.Services.AddScoped<IInsightService, InsightService>();
```

> **Why:** `InsightService` is stateless per-request (reads from Supabase, no shared mutable state), so `Scoped` is the correct lifetime — same as all other services in this project.

---

### [x] STEP 6 — Write InsightServiceTests

Create `apps/api/tests/PersonalFinance.Tests/Services/InsightServiceTests.cs`:

```csharp
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Services;

public class InsightServiceTests
{
    private static Transaction Expense(string cat, decimal amount, DateTime date, string wallet = "BCA") =>
        new() { Type = "Expense", Category = cat, AmountIdr = amount, Date = date, Wallet = wallet, Description = $"Test {cat}" };

    private static Transaction Income(string cat, decimal amount, DateTime date, string wallet = "BCA") =>
        new() { Type = "Income", Category = cat, AmountIdr = amount, Date = date, Wallet = wallet, Description = $"Test income" };

    // ── statement_gap ──────────────────────────────────────────────────────

    [Fact]
    public void DetectStatementGaps_WalletLastTxOlderThan35Days_ReturnsAlert()
    {
        var today = DateTime.Today;
        var old = Expense("Food", 100_000m, today.AddDays(-40));
        var result = InsightService.TestDetectStatementGaps(new[] { old }.ToList(), new List<Transaction>(), today);
        Assert.Single(result);
        Assert.Equal("alert", result[0].Severity);
        Assert.Contains("BCA", result[0].Title);
    }

    [Fact]
    public void DetectStatementGaps_WalletHasRecentTx_ReturnsNoInsight()
    {
        var today = DateTime.Today;
        var recent = Expense("Food", 100_000m, today.AddDays(-5));
        var result = InsightService.TestDetectStatementGaps(new[] { recent }.ToList(), new List<Transaction>(), today);
        Assert.Empty(result);
    }

    // ── habit_break (investment) ───────────────────────────────────────────

    [Fact]
    public void DetectHabitBreaks_Investment_PresentIn2TrailingMonthsButNotCurrent_ReturnsStreakBreak()
    {
        var today = DateTime.Today;
        var m1 = today.AddMonths(-1);
        var m2 = today.AddMonths(-2);
        var trailing = new List<Transaction>
        {
            Expense("Stocks", 1_000_000m, new DateTime(m1.Year, m1.Month, 10)),
            Expense("Stocks", 1_000_000m, new DateTime(m2.Year, m2.Month, 10)),
        };
        var trailingMonths = Enumerable.Range(1, 3).Select(i => new DateTime(today.Year, today.Month, 1).AddMonths(-i)).ToList();
        var result = InsightService.TestDetectHabitBreaks(new List<Transaction>(), trailing, trailingMonths,
            new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Stocks", "Investment", "Saham", "Mutual Fund", "Reksa Dana", "SBN", "ORI", "Crypto", "P2P" },
            "investment");
        Assert.Single(result);
        Assert.Equal("streak_break", result[0].Severity);
    }

    [Fact]
    public void DetectHabitBreaks_Investment_OnlyOneTrailingMonth_ReturnsNoInsight()
    {
        var today = DateTime.Today;
        var m1 = today.AddMonths(-1);
        var trailing = new List<Transaction>
        {
            Expense("Stocks", 1_000_000m, new DateTime(m1.Year, m1.Month, 10)),
        };
        var trailingMonths = Enumerable.Range(1, 3).Select(i => new DateTime(today.Year, today.Month, 1).AddMonths(-i)).ToList();
        var result = InsightService.TestDetectHabitBreaks(new List<Transaction>(), trailing, trailingMonths,
            new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Stocks", "Investment" }, "investment");
        Assert.Empty(result);
    }

    // ── over_budget ────────────────────────────────────────────────────────

    [Fact]
    public void DetectOverBudget_Category130PctAboveAvg_AfterDay15_ReturnsWarning()
    {
        var today = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 20);
        var m1 = today.AddMonths(-1);
        var m2 = today.AddMonths(-2);
        var m3 = today.AddMonths(-3);
        var trailing = new List<Transaction>
        {
            Expense("Coffee", 300_000m, new DateTime(m1.Year, m1.Month, 5)),
            Expense("Coffee", 300_000m, new DateTime(m2.Year, m2.Month, 5)),
            Expense("Coffee", 300_000m, new DateTime(m3.Year, m3.Month, 5)),
        };
        var trailingMonths = Enumerable.Range(1, 3).Select(i => new DateTime(today.Year, today.Month, 1).AddMonths(-i)).ToList();
        var current = new List<Transaction>
        {
            Expense("Coffee", 500_000m, today.AddDays(-1))
        };
        var result = InsightService.TestDetectOverBudget(current, trailing, trailingMonths, today);
        Assert.Single(result);
        Assert.Equal("warning", result[0].Severity);
        Assert.Equal("Coffee", result[0].Category);
    }

    // ── under_budget ───────────────────────────────────────────────────────

    [Fact]
    public void DetectUnderBudget_Category70PctBelowAvg_NearEndOfMonth_ReturnsWin()
    {
        var daysInMonth = DateTime.DaysInMonth(DateTime.Today.Year, DateTime.Today.Month);
        var today = new DateTime(DateTime.Today.Year, DateTime.Today.Month, daysInMonth - 1);
        var m1 = today.AddMonths(-1);
        var m2 = today.AddMonths(-2);
        var m3 = today.AddMonths(-3);
        var trailing = new List<Transaction>
        {
            Expense("Food", 1_000_000m, new DateTime(m1.Year, m1.Month, 5)),
            Expense("Food", 1_000_000m, new DateTime(m2.Year, m2.Month, 5)),
            Expense("Food", 1_000_000m, new DateTime(m3.Year, m3.Month, 5)),
        };
        var trailingMonths = Enumerable.Range(1, 3).Select(i => new DateTime(today.Year, today.Month, 1).AddMonths(-i)).ToList();
        var current = new List<Transaction>
        {
            Expense("Food", 400_000m, today.AddDays(-1))
        };
        var result = InsightService.TestDetectUnderBudget(current, trailing, trailingMonths, today);
        Assert.Single(result);
        Assert.Equal("win", result[0].Severity);
    }

    // ── large_transaction ──────────────────────────────────────────────────

    [Fact]
    public void DetectLargeTransactions_SingleTxDoubleMonthlyAvg_ReturnsInfo()
    {
        var today = DateTime.Today;
        var m1 = today.AddMonths(-1);
        var m2 = today.AddMonths(-2);
        var m3 = today.AddMonths(-3);
        var trailing = new List<Transaction>
        {
            Expense("Medical", 200_000m, new DateTime(m1.Year, m1.Month, 5)),
            Expense("Medical", 200_000m, new DateTime(m2.Year, m2.Month, 5)),
            Expense("Medical", 200_000m, new DateTime(m3.Year, m3.Month, 5)),
        };
        var trailingMonths = Enumerable.Range(1, 3).Select(i => new DateTime(today.Year, today.Month, 1).AddMonths(-i)).ToList();
        var current = new List<Transaction>
        {
            Expense("Medical", 1_500_000m, today.AddDays(-2))
        };
        var result = InsightService.TestDetectLargeTransactions(current, trailing, trailingMonths);
        Assert.Single(result);
        Assert.Equal("info", result[0].Severity);
    }
}
```

> **Why:** All detectors are exposed as `internal static` test hooks (see note in InsightService below) so the tests don't need Supabase at all — pure data pipeline tests. Naming follows `MethodName_Condition_ExpectedResult` per TEST-02. No `[Fact(Skip=...)]` — these are genuinely testable.

**Note:** Add `internal static` wrappers in `InsightService.cs` for each detector method so tests can call them directly. Add `[assembly: InternalsVisibleTo("PersonalFinance.Tests")]` to the Application project or use `public static` for the detector methods (since they carry no sensitive logic).

In `InsightService.cs`, change the 5 private static detector methods to `internal static`:

```csharp
internal static IEnumerable<InsightDto> TestDetectStatementGaps(...) => DetectStatementGaps(...);
// etc. — or simply make the detectors internal static directly
```

The simplest approach: make the 5 `private static` detector methods `internal static` directly (remove the `private` modifier and add `internal`).

---

### [x] STEP 7 — Create frontend types

Create `apps/frontend/src/types/Insight.ts`:

```typescript
export type InsightSeverity = 'info' | 'win' | 'warning' | 'alert' | 'streak_break';

export interface Insight {
  id: string;
  type: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  metricLabel?: string;
  metricValue?: number;
  category?: string;
  actionType?: 'navigate' | null;
  actionTarget?: string | null;
  validUntil: string;
}

export interface DailyPulse {
  headline: string;
  tone: 'positive' | 'neutral' | 'caution';
  monthProgress: number;
  paceVsBaseline?: number | null;
}
```

> **Why:** Mirrors `InsightDto.cs` field names (camelCase as JSON-serialized by .NET). Keeps the types in `src/types/` per frontend conventions.

---

### [x] STEP 8 — Create insightsApi.ts

Create `apps/frontend/src/api/insightsApi.ts`:

```typescript
import type { Insight, DailyPulse } from '@/types/Insight';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7208';

export const getInsights = (): Promise<Insight[]> =>
  fetch(`${BASE}/api/insights`).then(r => {
    if (!r.ok) throw new Error('Failed to load insights');
    return r.json();
  });

export const getDailyPulse = (): Promise<DailyPulse> =>
  fetch(`${BASE}/api/insights/daily-pulse`).then(r => {
    if (!r.ok) throw new Error('Failed to load daily pulse');
    return r.json();
  });
```

> **Why:** Same pattern as `journeyApi.ts` and `spendingAnalysisApi.ts` — plain fetch, const BASE, no axios. No React Query in the API layer — that lives in the components.

---

### [x] STEP 9 — Create InsightCard component

Create `apps/frontend/src/components/cashflow/InsightCard.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, TrendingUp, TrendingDown, AlertTriangle, Info, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Insight, InsightSeverity } from '@/types/Insight';

const SEVERITY_CONFIG: Record<InsightSeverity, {
  icon: React.ElementType;
  band: string;
  badge: string;
}> = {
  alert:        { icon: AlertTriangle, band: 'border-l-red-500',    badge: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  warning:      { icon: TrendingUp,   band: 'border-l-amber-400',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  streak_break: { icon: TrendingDown, band: 'border-l-orange-400',  badge: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  win:          { icon: Trophy,       band: 'border-l-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  info:         { icon: Info,         band: 'border-l-blue-400',    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
};

interface Props {
  insight: Insight;
  onDismiss: (id: string) => void;
}

export const InsightCard = ({ insight, onDismiss }: Props) => {
  const navigate = useNavigate();
  const cfg = SEVERITY_CONFIG[insight.severity] ?? SEVERITY_CONFIG.info;
  const Icon = cfg.icon;

  return (
    <div className={cn(
      'relative flex gap-3 rounded-lg border border-border bg-card px-4 py-3',
      'border-l-4', cfg.band
    )}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{insight.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{insight.body}</p>

        {insight.metricLabel && insight.metricValue !== undefined && (
          <span className={cn('mt-2 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium', cfg.badge)}>
            {insight.metricLabel}: {insight.metricValue?.toLocaleString('id-ID')}
          </span>
        )}

        {insight.actionType === 'navigate' && insight.actionTarget && (
          <button
            onClick={() => navigate(insight.actionTarget!)}
            className="mt-2 block text-xs text-primary underline underline-offset-2 hover:opacity-80"
          >
            Lihat →
          </button>
        )}
      </div>

      <button
        onClick={() => onDismiss(insight.id)}
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Tutup"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
```

> **Why:** Left color band (4px `border-l-*`) provides instant severity signal without aggressive background fills — matches the data-oriented-theme's minimalist palette. Dismiss is session-scoped (no API call) — server persistence lands in PF-119.

---

### [x] STEP 10 — Create DailyPulse component

Create `apps/frontend/src/components/cashflow/DailyPulse.tsx`:

```tsx
import { cn } from '@/lib/utils';
import type { DailyPulse as DailyPulseType } from '@/types/Insight';

const TONE_STYLE = {
  positive: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200',
  neutral:  'bg-muted/50 border-border text-muted-foreground',
  caution:  'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200',
};

interface Props {
  pulse: DailyPulseType | null;
  isLoading?: boolean;
}

export const DailyPulse = ({ pulse, isLoading }: Props) => {
  if (isLoading || !pulse) {
    return <div className="h-9 rounded-md bg-muted animate-pulse" />;
  }

  return (
    <div className={cn(
      'flex items-center gap-2.5 rounded-md border px-3.5 py-2 text-sm',
      TONE_STYLE[pulse.tone]
    )}>
      <span className="text-base">{pulse.tone === 'positive' ? '✦' : pulse.tone === 'caution' ? '⚠' : '·'}</span>
      <span className="font-medium">{pulse.headline}</span>
    </div>
  );
};
```

> **Why:** Single-line banner with tone-coded background. No chart or number — it's a sentence, not a metric. The `·` / `✦` / `⚠` glyphs are Unicode, not emoji, consistent with the data-oriented-theme's typographic minimalism.

---

### [x] STEP 11 — Create CashflowQuestStrip component

Create `apps/frontend/src/components/cashflow/CashflowQuestStrip.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Tag, RefreshCw } from 'lucide-react';

export interface CashflowQuest {
  id: string;
  label: string;
  count?: number;
  actionPath: string;
  icon: 'alert' | 'tag' | 'refresh';
}

const ICONS = {
  alert:   AlertCircle,
  tag:     Tag,
  refresh: RefreshCw,
};

interface Props {
  quests: CashflowQuest[];
}

export const CashflowQuestStrip = ({ quests }: Props) => {
  const navigate = useNavigate();

  if (!quests.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
      {quests.map(q => {
        const Icon = ICONS[q.icon];
        return (
          <button
            key={q.id}
            onClick={() => navigate(q.actionPath)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
          >
            <Icon className="h-3.5 w-3.5" />
            {q.label}
            {q.count !== undefined && (
              <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {q.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
```

> **Why:** Pill-shaped chips in a horizontal scroll strip — lighter than full QuestCards from the Journey module. These are cashflow-specific action prompts, not scored Journey quests. The quest data for Phase 1 is assembled client-side from the insights array (e.g. if a `statement_gap` insight exists → add "Upload statement" chip).

---

### [x] STEP 12 — Create InsightStack component

Create `apps/frontend/src/components/cashflow/InsightStack.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { InsightCard } from './InsightCard';
import type { Insight } from '@/types/Insight';

interface Props {
  insights: Insight[];
  isLoading?: boolean;
}

const Skeleton = () => (
  <div className="space-y-2">
    {[1, 2].map(i => (
      <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
    ))}
  </div>
);

export const InsightStack = ({ insights, isLoading }: Props) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = insights.filter(i => !dismissed.has(i.id));

  if (isLoading) return <Skeleton />;

  if (!visible.length) {
    return (
      <div className="rounded-lg border border-dashed border-border px-5 py-4 text-center">
        <p className="text-sm font-medium text-muted-foreground">Semua aman ✦</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Tidak ada insight yang perlu perhatianmu saat ini.{' '}
          <Link to="/cashflow/analysis" className="underline underline-offset-2 hover:text-foreground">
            Lihat Spend Pulse
          </Link>{' '}
          untuk analisis lebih dalam.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map(insight => (
        <InsightCard
          key={insight.id}
          insight={insight}
          onDismiss={id => setDismissed(prev => new Set([...prev, id]))}
        />
      ))}
    </div>
  );
};
```

> **Why:** Dismiss state in `useState` is session-scoped — survives re-renders but not page reload. Persistent dismiss lands in PF-119 when the `cashflow_insights` table ships. Empty state links to Spend Pulse (already built in PF-108) rather than inventing a new dead-end screen.

---

### [x] STEP 13 — Update OverviewTab.tsx

Replace the content of `apps/frontend/src/pages/cashflow/OverviewTab.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDashboardData } from '@/api/transactionsApi';
import { getInsights, getDailyPulse } from '@/api/insightsApi';
import type { DashboardData } from '@/types/Dashboard';
import NetCashflowCard from '@/components/dashboard/widgets/NetCashflowCard';
import TopCategoriesCard from '@/components/dashboard/widgets/TopCategoriesCard';
import MonthlyFlowChart from '@/components/dashboard/widgets/MonthlyFlowChart';
import CurrentBalanceStrip from '@/components/dashboard/CurrentBalanceStrip';
import { DailyPulse } from '@/components/cashflow/DailyPulse';
import { CashflowQuestStrip } from '@/components/cashflow/CashflowQuestStrip';
import { InsightStack } from '@/components/cashflow/InsightStack';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CashflowQuest } from '@/components/cashflow/CashflowQuestStrip';

const RANGES = [
  { label: 'Last Month', value: 1 },
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '1Y', value: 12 },
  { label: '2Y', value: 24 },
  { label: 'YTD', value: 0 },
];

const OverviewTab = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useLocalStorage<number>('pf_overview_range', 1);
  const [refOpen, setRefOpen] = useLocalStorage<boolean>('pf_overview_ref_open', false);

  const { data: insights = [], isLoading: insightsLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: getInsights,
    staleTime: 5 * 60 * 1000,
  });

  const { data: pulse, isLoading: pulseLoading } = useQuery({
    queryKey: ['daily-pulse'],
    queryFn: getDailyPulse,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await getDashboardData(undefined, undefined, undefined, range);
        setData(result);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Could not load dashboard data — check your connection and try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [range]);

  // Derive quest chips from insights
  const quests: CashflowQuest[] = [
    ...insights.filter(i => i.type === 'statement_gap').map(i => ({
      id: i.id,
      label: i.title,
      actionPath: '/cashflow/upload',
      icon: 'alert' as const,
    })),
    ...(insights.some(i => i.type === 'habit_break')
      ? [{ id: 'habit', label: 'Cek kebiasaan investasi', actionPath: '/investment/overview', icon: 'refresh' as const }]
      : []),
  ];

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <CurrentBalanceStrip />
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="h-8 px-3 text-xs font-medium gap-1.5"
              onClick={() => navigate('/cashflow/upload')}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Statement
            </Button>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-0.5">
              {RANGES.map((r) => (
                <Button
                  key={r.label}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 px-2.5 text-xs font-medium transition-all rounded-md',
                    range === r.value
                      ? 'bg-secondary text-foreground hover:bg-secondary'
                      : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                  )}
                  onClick={() => setRange(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Daily Pulse */}
        <DailyPulse pulse={pulse ?? null} isLoading={pulseLoading} />

        {/* Quest chips */}
        {quests.length > 0 && <CashflowQuestStrip quests={quests} />}

        {/* Insight stack */}
        <InsightStack insights={insights} isLoading={insightsLoading} />

        {/* Staleness badge */}
        {!error && data?.dataThrough && (() => {
          const [monthName, yearStr] = data.dataThrough.split(' ');
          const dateThroughDate = new Date(`${monthName} 1, ${yearStr}`);
          const isStale = !isNaN(dateThroughDate.getTime()) &&
            new Date().getTime() - dateThroughDate.getTime() > 30 * 24 * 60 * 60 * 1000;
          return isStale ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span>Data through {data.dataThrough} —{' '}</span>
              <button
                onClick={() => navigate('/cashflow/upload')}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                upload a new statement to sync
              </button>
            </div>
          ) : null;
        })()}

        {/* Reference data — collapsible */}
        <Collapsible open={refOpen} onOpenChange={setRefOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
            <span>Reference data</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', refOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {range === 0 && data && data.cashFlow.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Showing {data.dataThrough} only — upload data for subsequent months to see full YTD.
              </p>
            )}
            <div className="grid grid-cols-[1fr_320px] gap-4">
              <NetCashflowCard data={data?.currentMonth || null} isLoading={isLoading} />
              <TopCategoriesCard
                data={data?.topCategories || null}
                month={data?.currentMonth?.month || ''}
                isLoading={isLoading}
              />
            </div>
            <MonthlyFlowChart
              data={data?.cashFlow || null}
              isLoading={isLoading}
              rangeLabel={data?.currentMonth?.month}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};

export default OverviewTab;
```

> **Why:** The `Collapsible` component from shadcn/ui wraps the existing widgets — no functional regression, just deferred visibility. The open state is persisted in `localStorage` via `useLocalStorage` so users who prefer the charts don't have to expand it every visit. Insights use React Query (`useQuery`) while dashboard data stays on the existing `useEffect` pattern to avoid refactoring scope.

**Prerequisite:** Run `npx shadcn@latest add collapsible` if the Collapsible component is not yet installed.

```bash
cd apps/frontend && npx shadcn@latest add collapsible
```

---

## Notes

- `OverviewTab.tsx` is the actual filename (not `CashflowOverview.tsx` — checked in exploration)
- `Transaction` entity `Wallet` field maps to the bank name (e.g. "BCA", "Superbank") — used in `statement_gap` detector
- The `InsightService` detectors must be `internal static` (not `private static`) so `InsightServiceTests` can call them without Supabase. Add `[assembly: InternalsVisibleTo("PersonalFinance.Tests")]` to `Application.csproj` if needed
- `over_budget` only fires from day 15 onward, `under_budget` only fires in the last 3 days of the month — prevents premature/stale cards
- Habit break requires ≥2 of last 3 trailing months with matching category to avoid flagging genuinely new behaviors
- The `Collapsible` shadcn component may not exist yet — install it before testing OverviewTab
- Next: PF-119 (AI-narrated insights + server-persisted dismiss) is gated on 1 week of real usage data after this ships
