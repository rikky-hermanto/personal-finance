using System.Globalization;
using System.Text.RegularExpressions;
using PersonalFinance.Application.Constants;
using PersonalFinance.Application.Dtos.Buckets;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Services.Buckets;

/// <summary>
/// Buckets derivation + waterfall — pure static class, zero Supabase/HTTP/ILogger dependencies.
/// Ported from docs/features/budgeting/pf-buckets-data.js and pf-buckets.jsx (BkWaterfall) per
/// docs/features/budgeting/buckets-build-plan.md. Same three-way split (Committed/Future/Free),
/// same median-not-mean derivation, same ordered-cascade waterfall.
/// </summary>
public static class BucketCalculator
{
    private static readonly HashSet<string> InvestingCategories = CashflowSectionMapping.CategoryToSection
        .Where(kv => kv.Value == CashflowSection.Investing)
        .Select(kv => kv.Key)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    // A recurring description is only eligible for Committed if its category can plausibly be a
    // fixed obligation. Day-to-day discretionary categories (Food, Transport, Shopping...) never
    // qualify, even if the same merchant description recurs 3 months running — otherwise a habitual
    // coffee order gets promoted to "essential" spend, which corrupts the L2 emergency-fund
    // denominator (formulas.md: essential, not total, expense). Loan/Credit Card are Financing-section
    // installments, not Investing, so they need listing explicitly.
    private static readonly HashSet<string> CommittedEligibleCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "Bill", "Subscription", "Insurance", "Loan", "Credit Card",
    };

    public static decimal Median(IReadOnlyList<decimal> values)
    {
        if (values.Count == 0) return 0m;
        var sorted = values.OrderBy(v => v).ToList();
        var mid = sorted.Count / 2;
        return sorted.Count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2m : sorted[mid];
    }

    public static string NormalizeDescription(string description)
    {
        var lower = description.ToLowerInvariant();
        var noDigits = Regex.Replace(lower, @"\d+", " ");
        var noSpecial = Regex.Replace(noDigits, @"[^a-z\s]", " ");
        return Regex.Replace(noSpecial, @"\s+", " ").Trim();
    }

    public static bool IsInvestingCategory(string category) => InvestingCategories.Contains(category);

    /// <summary>
    /// Per-item recurring-commitment detection over the trailing complete months. A normalized
    /// description recurring in >=2 of 3 months is Committed; Investing-section spend is Future
    /// (excluded here, it never competes with Committed); everything else is Free. Unlike
    /// SpendingAnalysisService.DetectCommittedBills, this returns line items (not a single sum) and
    /// does not drop items already charged this month — Buckets shows the full list with a Paid flag.
    /// </summary>
    public static List<CommittedItemDto> DetectCommittedItems(
        List<Transaction> trailingTxs,
        List<Transaction> currentMonthTxs,
        List<DateTime> trailingMonths,
        HashSet<string> demotedKeys)
    {
        var trailingExpenses = trailingTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Where(t => CommittedEligibleCategories.Contains(t.Category))
            .ToList();

        var currentKeys = currentMonthTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Select(t => NormalizeDescription(t.Description))
            .ToHashSet();

        return trailingExpenses
            .GroupBy(t => NormalizeDescription(t.Description))
            .Where(g => g.Key.Length >= 3)
            .Where(g => !demotedKeys.Contains(g.Key))
            .Where(g => trailingMonths.Count(m => g.Any(t => t.Date.Year == m.Year && t.Date.Month == m.Month)) >= 2)
            .Select(g =>
            {
                var amounts = g.Select(t => t.AmountIdr).ToList();
                var amount = Median(amounts);
                var mean = amounts.Average();
                var spread = amounts.Count > 1 ? amounts.Max() - amounts.Min() : 0m;
                var variancePct = mean > 0 ? spread / mean : 0m;
                var certain = variancePct <= BucketDefaults.WatchVariancePct;
                var latest = g.OrderByDescending(t => t.Date).First();
                var occurrencesInLatestMonth = g.Count(t => t.Date.Year == latest.Date.Year && t.Date.Month == latest.Date.Month);
                var due = occurrencesInLatestMonth > 2 ? "recurring" : latest.Date.ToString("MMM d", CultureInfo.InvariantCulture);

                return new CommittedItemDto(
                    Key: g.Key,
                    Name: ToTitleCase(g.Key),
                    Amount: Math.Round(amount, 0),
                    Due: due,
                    Source: latest.AccountName,
                    Certain: certain,
                    Paid: currentKeys.Contains(g.Key),
                    Note: certain ? null : $"varies ±{Math.Round(variancePct * 100, 0)}%"
                );
            })
            .OrderByDescending(i => i.Amount)
            .ToList();
    }

    private static string ToTitleCase(string s) =>
        string.IsNullOrEmpty(s) ? s : CultureInfo.InvariantCulture.TextInfo.ToTitleCase(s);

    /// <summary>
    /// Median (not mean) of each bucket's monthly total across the trailing complete months — one
    /// Ramadan month must not set the year's budget. <paramref name="committedKeys"/> must come from
    /// DetectCommittedItems so the item list and the totals classify identically (including demotions).
    /// </summary>
    public static (decimal Committed, decimal Future, decimal Free, decimal Income) DeriveMonthlyMedians(
        List<Transaction> trailingTxs,
        List<DateTime> trailingMonths,
        HashSet<string> committedKeys)
    {
        decimal MonthCommitted(DateTime m) => trailingTxs
            .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Where(t => CommittedEligibleCategories.Contains(t.Category))
            .Where(t => committedKeys.Contains(NormalizeDescription(t.Description)))
            .Sum(t => t.AmountIdr);

        decimal MonthFuture(DateTime m) => trailingTxs
            .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Where(t => InvestingCategories.Contains(t.Category))
            .Sum(t => t.AmountIdr);

        decimal MonthIncome(DateTime m) => trailingTxs
            .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month && t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase))
            .Sum(t => t.AmountIdr);

        decimal MonthFree(DateTime m) => trailingTxs
            .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Where(t => !InvestingCategories.Contains(t.Category))
            .Where(t => !committedKeys.Contains(NormalizeDescription(t.Description)))
            .Sum(t => t.AmountIdr);

        var committed = Median(trailingMonths.Select(MonthCommitted).ToList());
        var future = Median(trailingMonths.Select(MonthFuture).ToList());
        var free = Median(trailingMonths.Select(MonthFree).ToList());
        var income = Median(trailingMonths.Select(MonthIncome).ToList());

        return (Math.Round(committed, 0), Math.Round(future, 0), Math.Round(free, 0), Math.Round(income, 0));
    }

    /// <summary>Categories whose month-to-month spend swings beyond WatchVariancePct — surfaces as the `inferred` badge (FIN-04: unevaluated stays visibly unevaluated).</summary>
    public static List<string> DetectWatchCategories(List<Transaction> trailingTxs, List<DateTime> trailingMonths)
    {
        var categories = trailingTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Select(t => t.Category)
            .Distinct();

        var watch = new List<string>();
        foreach (var cat in categories)
        {
            var monthly = trailingMonths
                .Select(m => trailingTxs
                    .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month && t.Category == cat)
                    .Sum(t => t.AmountIdr))
                .ToList();
            var mean = monthly.Average();
            if (mean <= 0) continue;
            var spread = monthly.Max() - monthly.Min();
            if (spread / mean > BucketDefaults.WatchVariancePct) watch.Add(cat);
        }
        return watch;
    }

    /// <summary>
    /// Ordered cascade Committed -> Future -> Free. Each tier fills completely before the next
    /// receives anything; a shortfall stops at exactly one named tier and reports it. Never
    /// pro-rata, never silent.
    /// </summary>
    public static WaterfallResultDto Allocate(decimal arrived, decimal committed, decimal future, decimal freeBudget, string freeLabel)
    {
        var rest = arrived;
        var tiers = new (string Kind, string Name, decimal Want)[]
        {
            ("committed", "Committed", committed),
            ("future", "Future", future),
            ("free", freeLabel, freeBudget),
        };

        var results = new List<WaterfallTierResultDto>();
        string? stoppedAt = null;
        foreach (var t in tiers)
        {
            var got = Math.Max(0, Math.Min(t.Want, rest));
            rest -= got;
            var shortAmt = t.Want - got;
            results.Add(new WaterfallTierResultDto(t.Kind, t.Name, t.Want, got, shortAmt));
            if (shortAmt > 0 && stoppedAt is null) stoppedAt = t.Name;
        }

        return new WaterfallResultDto(results, stoppedAt, results.Sum(r => r.Short));
    }

    /// <summary>
    /// Total liquid cash across every account, never a single account's slice — the emergency-fund
    /// denominator must not shrink because the balance happens to be split across banks.
    /// </summary>
    public static decimal SumLiquid(IEnumerable<decimal> accountBalances) => accountBalances.Sum();
}
