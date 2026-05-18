using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;
using Microsoft.Extensions.Logging;
using System.Text.RegularExpressions;
using static Supabase.Postgrest.Constants;

public class SpendingAnalysisService : ISpendingAnalysisService
{
    private readonly Supabase.Client _supabase;
    private readonly ILogger<SpendingAnalysisService> _logger;

    public SpendingAnalysisService(Supabase.Client supabase, ILogger<SpendingAnalysisService> logger)
    {
        _supabase = supabase;
        _logger = logger;
    }

    public async Task<SafeToSpendDto> GetSafeToSpendAsync(Guid? accountId = null)
    {
        var today = DateTime.Today;
        var currentMonthStart = new DateTime(today.Year, today.Month, 1);
        var fetchStart = currentMonthStart.AddMonths(-3);

        _logger.LogInformation("Computing safe-to-spend for accountId={AccountId}", accountId);

        var transactions = await FetchTransactionsAsync(fetchStart, today, accountId);

        var currentMonthTxs = transactions.Where(t => t.Date >= currentMonthStart).ToList();
        var trailingTxs = transactions.Where(t => t.Date < currentMonthStart).ToList();

        // Income baseline: average monthly income over last 3 complete months
        var trailingMonths = Enumerable.Range(1, 3).Select(i => currentMonthStart.AddMonths(-i)).ToList();
        var incomeBaseline = trailingMonths
            .Select(m => trailingTxs
                .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month && t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase))
                .Sum(t => t.AmountIdr))
            .DefaultIfEmpty(0m)
            .Average();

        // Already spent: all expenses in current month
        var alreadySpent = currentMonthTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Sum(t => t.AmountIdr);

        // Committed bills: recurring expenses not yet charged this month
        var committedBills = DetectCommittedBills(trailingTxs, currentMonthTxs, trailingMonths);

        const decimal savingsGoal = 0m;

        var daysRemaining = DateTime.DaysInMonth(today.Year, today.Month) - today.Day + 1;
        var numerator = incomeBaseline - committedBills - savingsGoal - alreadySpent;
        var amount = daysRemaining > 0 ? numerator / daysRemaining : 0m;
        var status = amount > 0 ? "ok" : amount >= -500_000m ? "warning" : "danger";

        _logger.LogInformation(
            "Safe-to-spend: {Amount} ({Status}) | baseline={Baseline} committed={Committed} spent={Spent} days={Days}",
            amount, status, incomeBaseline, committedBills, alreadySpent, daysRemaining);

        return new SafeToSpendDto(
            Math.Round(amount, 0),
            status,
            daysRemaining,
            Math.Round(incomeBaseline, 0),
            Math.Round(committedBills, 0),
            savingsGoal,
            Math.Round(alreadySpent, 0));
    }

    public async Task<VarianceExplainerDto> GetVarianceExplainerAsync(Guid? accountId = null)
    {
        var today = DateTime.Today;
        var currentMonthStart = new DateTime(today.Year, today.Month, 1);
        var fetchStart = currentMonthStart.AddMonths(-3);

        _logger.LogInformation("Computing variance explainer for accountId={AccountId}", accountId);

        var transactions = await FetchTransactionsAsync(fetchStart, today, accountId);

        var expenses = transactions
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var currentMonthExpenses = expenses.Where(t => t.Date >= currentMonthStart).ToList();
        var trailingExpenses = expenses.Where(t => t.Date < currentMonthStart).ToList();

        var trailingMonths = Enumerable.Range(1, 3).Select(i => currentMonthStart.AddMonths(-i)).ToList();
        var trailingByMonth = trailingMonths
            .Select(m => trailingExpenses
                .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month)
                .ToList())
            .ToList();

        var currentMonthTotal = currentMonthExpenses.Sum(t => t.AmountIdr);
        var trailingAvgTotal = trailingByMonth.Select(g => g.Sum(t => t.AmountIdr)).DefaultIfEmpty(0m).Average();

        var allCategories = expenses.Select(t => t.Category).Distinct();

        var drivers = allCategories
            .Select(cat =>
            {
                var currentSpend = currentMonthExpenses.Where(t => t.Category == cat).Sum(t => t.AmountIdr);
                var monthlySpends = trailingByMonth
                    .Select(g => g.Where(t => t.Category == cat).Sum(t => t.AmountIdr))
                    .ToList();
                var trailingAvg = monthlySpends.DefaultIfEmpty(0m).Average();
                var delta = currentSpend - trailingAvg;
                var monthsWithSpend = monthlySpends.Count(s => s > 0);
                return new VarianceDriverDto(
                    cat,
                    Math.Round(currentSpend, 0),
                    Math.Round(trailingAvg, 0),
                    Math.Round(delta, 0),
                    monthsWithSpend <= 1);
            })
            .Where(d => Math.Abs(d.Delta) > 0)
            .OrderByDescending(d => Math.Abs(d.Delta))
            .ToList();

        var delta = currentMonthTotal - trailingAvgTotal;
        var deltaPct = trailingAvgTotal != 0 ? delta / trailingAvgTotal * 100m : 0m;

        _logger.LogInformation(
            "Variance: current={Current} trailingAvg={TrailingAvg} delta={Delta} ({DeltaPct}%)",
            currentMonthTotal, trailingAvgTotal, delta, deltaPct);

        return new VarianceExplainerDto(
            Math.Round(currentMonthTotal, 0),
            Math.Round(trailingAvgTotal, 0),
            Math.Round(delta, 0),
            Math.Round(deltaPct, 1),
            drivers);
    }

    private async Task<List<Transaction>> FetchTransactionsAsync(DateTime start, DateTime end, Guid? accountId)
    {
        var all = new List<Transaction>();
        int pageSize = 1000;
        int offset = 0;
        bool hasMore = true;

        while (hasMore)
        {
            var query = _supabase.From<Transaction>()
                .Filter("date", Operator.GreaterThanOrEqual, start)
                .Filter("date", Operator.LessThanOrEqual, end)
                .Order("date", Ordering.Descending)
                .Range(offset, offset + pageSize - 1);

            if (accountId.HasValue)
                query = query.Filter("account_id", Operator.Equals, accountId.Value.ToString());

            var result = await query.Get();
            all.AddRange(result.Models);

            if (result.Models.Count < pageSize) hasMore = false;
            else offset += pageSize;
        }

        return all;
    }

    private static decimal DetectCommittedBills(
        List<Transaction> trailingTxs,
        List<Transaction> currentMonthTxs,
        List<DateTime> trailingMonths)
    {
        var trailingExpenses = trailingTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var currentNormalizedKeys = currentMonthTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Select(t => NormalizeDescription(t.Description))
            .ToHashSet();

        return trailingExpenses
            .GroupBy(t => NormalizeDescription(t.Description))
            .Where(g => g.Key.Length >= 3)
            .Where(g => trailingMonths.Count(m => g.Any(t => t.Date.Year == m.Year && t.Date.Month == m.Month)) >= 2)
            .Where(g => !currentNormalizedKeys.Contains(g.Key))
            .Sum(g => g.Average(t => t.AmountIdr));
    }

    private static string NormalizeDescription(string description)
    {
        var lower = description.ToLowerInvariant();
        var noDigits = Regex.Replace(lower, @"\d+", " ");
        var noSpecial = Regex.Replace(noDigits, @"[^a-z\s]", " ");
        return Regex.Replace(noSpecial, @"\s+", " ").Trim();
    }
}
