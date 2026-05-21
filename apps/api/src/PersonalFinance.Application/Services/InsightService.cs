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
                "Welcome! Keep uploading statements to start seeing your personal insights.",
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
            headline = $"Your spending this month is {Math.Abs(Math.Round(paceRatio * 100))}% below average — great job!";
            tone = "positive";
        }
        else if (paceRatio > 0.20m)
        {
            headline = $"Your spending is already {Math.Round(paceRatio * 100)}% above your usual monthly average — watch out.";
            tone = "caution";
        }
        else
        {
            headline = "Your spending this month is within normal range — on track.";
            tone = "neutral";
        }

        return new DailyPulseDto(headline, tone, monthProgress, Math.Round(paceRatio, 3));
    }

    // ── Detectors ────────────────────────────────────────────────────────────

    internal static IEnumerable<InsightDto> DetectStatementGaps(
        List<Transaction> current, List<Transaction> trailing, DateTime today)
    {
        var allTx = current.Concat(trailing).ToList();
        var cutoff = today.AddDays(-35);

        return allTx
            .GroupBy(t => t.Wallet)
            .Where(g => !string.IsNullOrEmpty(g.Key))
            .Where(g => g.Max(t => t.Date) < cutoff)
            .Select(g => new InsightDto(
                $"statement_gap-{g.Key}",
                "statement_gap",
                "alert",
                $"{g.Key}: statement not uploaded",
                $"Last data from {g.Key} is over 35 days old. Upload the latest statement to keep your insights accurate.",
                "Days since last", (decimal)(today - g.Max(t => t.Date)).TotalDays,
                null, "navigate", "/cashflow/upload",
                DateTime.Today.AddDays(7)));
    }

    internal static IEnumerable<InsightDto> DetectHabitBreaks(
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

        var title = habitKey == "investment"
            ? "No investment transactions this month"
            : "No savings transfer this month";
        var body = habitKey == "investment"
            ? "You usually invest every month. Nothing yet this month — check if it's been scheduled."
            : "You usually set aside savings every month. Nothing has been detected this month.";

        yield return new InsightDto(
            $"habit_break-{habitKey}",
            "habit_break",
            "streak_break",
            title, body,
            "Consecutive prior months", hadHabitInTrailing,
            null, "navigate",
            habitKey == "investment" ? "/investment/overview" : "/assets/accounts",
            DateTime.Today.AddMonths(1).AddDays(-DateTime.Today.Day));
    }

    internal static IEnumerable<InsightDto> DetectLargeTransactions(
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
                    $"Large transaction in {cat}",
                    $"{tx.Description} ({tx.Date:dd MMM}) of Rp {tx.AmountIdr:N0} — more than 2× your monthly average for this category.",
                    "Monthly average", monthlyAvg,
                    cat, null, null,
                    DateTime.Today.AddDays(14));
            }
        }
    }

    internal static IEnumerable<InsightDto> DetectOverBudget(
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
                $"{cat} is over your average",
                $"{cat} spending this month is Rp {currentSpend:N0} — {pct}% above your 3-month average (Rp {monthlyAvg:N0}).",
                "Above average", pct,
                cat, null, null,
                DateTime.Today.AddMonths(1).AddDays(-DateTime.Today.Day));
        }
    }

    internal static IEnumerable<InsightDto> DetectUnderBudget(
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
                $"Saved on {cat} this month!",
                $"You saved about Rp {saved:N0} on {cat} compared to your average. Consider moving it to savings or investments.",
                "Saved this month", saved,
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

        // Populate transient Wallet from accounts
        var accountIds = all.Select(t => t.AccountId).Where(id => id.HasValue).Select(id => id!.Value).Distinct().ToList();
        if (accountIds.Count > 0)
        {
            var accountsResult = await supabase.From<Account>().Get();
            var accountNames = accountsResult.Models.ToDictionary(a => a.Id, a => a.Name);
            foreach (var tx in all)
            {
                if (tx.AccountId.HasValue && accountNames.TryGetValue(tx.AccountId.Value, out var name))
                    tx.Wallet = name;
            }
        }

        return all;
    }
}
