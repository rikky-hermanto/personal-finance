using System.Globalization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Constants;
using PersonalFinance.Application.Dtos.Buckets;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Domain.Entities.Buckets;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Services.Buckets;

/// <summary>
/// Buckets I/O + orchestration — fetches transactions/accounts/settings and hands the pure math to
/// BucketCalculator. Mirrors the DeskService/DeskCalculator split (PF-133): calculation stays
/// unit-testable without mocking Supabase.
/// </summary>
public class BucketsService(Supabase.Client supabase, ILogger<BucketsService> logger) : IBucketsService
{
    // Placeholder user_id until PF-S08 (Supabase Auth) lands — matches the Desk convention.
    private static readonly Guid PlaceholderUserId = Guid.Empty;

    public async Task<BucketsResponseDto> GetBucketsAsync()
    {
        var today = DateTime.Today;
        var currentMonthStart = new DateTime(today.Year, today.Month, 1);
        var fetchStart = currentMonthStart.AddMonths(-3);

        var transactions = await FetchTransactionsAsync(fetchStart, today);
        var currentMonthTxs = transactions.Where(t => t.Date >= currentMonthStart).ToList();
        var trailingTxs = transactions.Where(t => t.Date < currentMonthStart).ToList();
        var trailingMonths = Enumerable.Range(1, 3).Select(i => currentMonthStart.AddMonths(-i)).ToList();

        var monthsAvailable = trailingMonths.Count(m => transactions.Any(t => t.Date.Year == m.Year && t.Date.Month == m.Month));

        var demotedKeys = await GetDemotedKeysAsync();
        var items = BucketCalculator.DetectCommittedItems(trailingTxs, currentMonthTxs, trailingMonths, demotedKeys);
        var committedKeys = items.Select(i => i.Key).ToHashSet();

        var (committedMedian, futureMedian, freeMedian, incomeMedian) =
            BucketCalculator.DeriveMonthlyMedians(trailingTxs, trailingMonths, committedKeys);
        var watchCategories = BucketCalculator.DetectWatchCategories(trailingTxs, trailingMonths);

        var settings = await GetSettingsAsync();
        var futurePlanned = settings?.FutureMonthlyAmount ?? futureMedian;
        var needsSetup = monthsAvailable >= BucketDefaults.MinMonthsForDaily && settings?.FutureMonthlyAmount is null;

        var freeBudget = Math.Round(incomeMedian - committedMedian - futurePlanned, 0);
        var softFloor = Math.Round(freeMedian * BucketDefaults.SoftFloorPct, 0);

        var freeSpent = currentMonthTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Where(t => !BucketCalculator.IsInvestingCategory(t.Category))
            .Where(t => !committedKeys.Contains(BucketCalculator.NormalizeDescription(t.Description)))
            .Sum(t => t.AmountIdr);

        var last7Start = today.AddDays(-BucketDefaults.ForecastPaceWindowDays);
        var last7DayFreeSpend = transactions
            .Where(t => t.Date >= last7Start && t.Date <= today)
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Where(t => !BucketCalculator.IsInvestingCategory(t.Category))
            .Where(t => !committedKeys.Contains(BucketCalculator.NormalizeDescription(t.Description)))
            .Sum(t => t.AmountIdr);

        var incomeArrivedThisMonth = currentMonthTxs
            .Where(t => t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase))
            .Sum(t => t.AmountIdr);

        var monthlyIncomes = trailingMonths
            .Select(m => trailingTxs
                .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month && t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase))
                .Sum(t => t.AmountIdr))
            .ToList();
        var incomeMean = monthlyIncomes.Count > 0 ? monthlyIncomes.Average() : 0m;
        var incomeVariancePct = incomeMean > 0 ? (monthlyIncomes.Max() - monthlyIncomes.Min()) / incomeMean : 0m;
        var variableIncome = incomeVariancePct > BucketDefaults.VariableIncomeThresholdPct;

        var totalLiquid = await GetTotalLiquidAsync();
        var emergencyFund = new EmergencyFundProgressDto(
            Now: totalLiquid,
            Target: committedMedian * BucketDefaults.EmergencyFundTargetMonths,
            TargetMonths: BucketDefaults.EmergencyFundTargetMonths);

        WaterfallResultDto? shortfall = null;
        var required = committedMedian + futurePlanned + freeBudget;
        if (today.Day <= BucketDefaults.MonthCloseWindowDays + 3 && incomeArrivedThisMonth > 0 && incomeArrivedThisMonth < required)
        {
            shortfall = BucketCalculator.Allocate(incomeArrivedThisMonth, committedMedian, futurePlanned, freeBudget, "Free");
        }

        var incomeArrivedDate = currentMonthTxs
            .Where(t => t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(t => t.Date)
            .Select(t => (DateTime?)t.Date)
            .FirstOrDefault()?
            .ToString("MMM d", CultureInfo.InvariantCulture);

        var (biggestCategory, biggestAmount, biggestUsual) = FindBiggestDriver(currentMonthTxs, trailingTxs, trailingMonths);

        logger.LogInformation(
            "Buckets derived: committed={Committed} future={Future} free={Free} income={Income} monthsAvailable={Months}",
            committedMedian, futurePlanned, freeBudget, incomeMedian, monthsAvailable);

        return new BucketsResponseDto(
            MonthsAvailable: monthsAvailable,
            NeedsSetup: needsSetup,
            Income: incomeMedian,
            Committed: committedMedian,
            FuturePlanned: futurePlanned,
            MedianFree: freeMedian,
            SoftFloor: softFloor,
            FreeBudget: freeBudget,
            FreeSpent: Math.Round(freeSpent, 0),
            Last7DayFreeSpend: Math.Round(last7DayFreeSpend, 0),
            Day: today.Day,
            DaysInMonth: DateTime.DaysInMonth(today.Year, today.Month),
            IncomeArrivedThisMonth: Math.Round(incomeArrivedThisMonth, 0),
            VariableIncome: variableIncome,
            IncomeVariancePct: Math.Round(incomeVariancePct, 4),
            Items: items,
            EmergencyFund: emergencyFund,
            Shortfall: shortfall,
            IncomeArrivedDate: incomeArrivedDate,
            BiggestDriverCategory: biggestCategory,
            BiggestDriverAmount: biggestAmount,
            BiggestDriverUsual: biggestUsual,
            WatchCategories: watchCategories);
    }

    public async Task<MonthCloseDto> GetMonthCloseAsync()
    {
        var today = DateTime.Today;
        var currentMonthStart = new DateTime(today.Year, today.Month, 1);
        var closingMonthStart = currentMonthStart.AddMonths(-1);
        var closingTrailingMonths = Enumerable.Range(1, 3).Select(i => closingMonthStart.AddMonths(-i)).ToList();
        var fetchStart = closingTrailingMonths.Min();
        var fetchEnd = closingMonthStart.AddMonths(1).AddDays(-1);

        var transactions = await FetchTransactionsAsync(fetchStart, fetchEnd);
        var closingMonthTxs = transactions.Where(t => t.Date.Year == closingMonthStart.Year && t.Date.Month == closingMonthStart.Month).ToList();
        var baselineTrailingTxs = transactions.Where(t => t.Date < closingMonthStart).ToList();

        var demotedKeys = await GetDemotedKeysAsync();
        var items = BucketCalculator.DetectCommittedItems(baselineTrailingTxs, closingMonthTxs, closingTrailingMonths, demotedKeys);
        var committedKeys = items.Select(i => i.Key).ToHashSet();

        var (committedMedian, futureMedian, _, incomeMedian) =
            BucketCalculator.DeriveMonthlyMedians(baselineTrailingTxs, closingTrailingMonths, committedKeys);

        var settings = await GetSettingsAsync();
        var futurePlanned = settings?.FutureMonthlyAmount ?? futureMedian;

        var futureActual = closingMonthTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase) && BucketCalculator.IsInvestingCategory(t.Category))
            .Sum(t => t.AmountIdr);

        var transfers = closingMonthTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase) && BucketCalculator.IsInvestingCategory(t.Category))
            .OrderBy(t => t.Date)
            .Select(t => new TransferDto(t.Date.ToString("MMM d", CultureInfo.InvariantCulture), t.AccountName, t.Category, t.AmountIdr))
            .ToList();

        var freeBudget = Math.Round(incomeMedian - committedMedian - futurePlanned, 0);
        var freeSpent = closingMonthTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .Where(t => !BucketCalculator.IsInvestingCategory(t.Category))
            .Where(t => !committedKeys.Contains(BucketCalculator.NormalizeDescription(t.Description)))
            .Sum(t => t.AmountIdr);
        var freeOverBy = Math.Max(0, Math.Round(freeSpent - freeBudget, 0));

        var allCommittedPaid = items.Count == 0 || items.All(i => i.Paid);
        var committedStreakMonths = ComputeCommittedStreak(transactions, closingMonthStart, closingTrailingMonths, committedKeys);

        var (biggestCategory, biggestAmount, biggestUsual) = FindBiggestDriver(closingMonthTxs, baselineTrailingTxs, closingTrailingMonths);

        // Never suggest less than what's already planned — the fresh-start nudge should only ever
        // encourage saving more, bumping toward the historical median when it runs ahead of the plan.
        var suggestedNextFuture = Math.Max(futurePlanned, futureMedian);

        return new MonthCloseDto(
            MonthLabel: closingMonthStart.ToString("MMMM", CultureInfo.InvariantCulture),
            CommittedStreakMonths: committedStreakMonths,
            AllCommittedPaid: allCommittedPaid,
            FuturePlanned: futurePlanned,
            FutureActual: Math.Round(futureActual, 0),
            Transfers: transfers,
            FreeBudget: freeBudget,
            FreeSpent: Math.Round(freeSpent, 0),
            FreeOverBy: freeOverBy,
            BiggestDriverCategory: biggestCategory,
            BiggestDriverAmount: biggestAmount,
            BiggestDriverUsual: biggestUsual,
            SuggestedNextFuture: suggestedNextFuture);
    }

    public async Task<BucketsResponseDto> SetFuturePlanAsync(decimal futureMonthlyAmount)
    {
        var existing = await supabase.From<BucketSettings>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Get();

        if (existing.Models.Count > 0)
        {
            var row = existing.Models[0];
            row.FutureMonthlyAmount = futureMonthlyAmount;
            row.UpdatedAt = DateTime.UtcNow;
            await supabase.From<BucketSettings>().Update(row);
        }
        else
        {
            await supabase.From<BucketSettings>().Insert(new BucketSettings
            {
                Id = Guid.NewGuid(),
                UserId = PlaceholderUserId,
                FutureMonthlyAmount = futureMonthlyAmount,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        }

        logger.LogInformation("Future plan set to {Amount} for user {UserId}", futureMonthlyAmount, PlaceholderUserId);
        return await GetBucketsAsync();
    }

    public async Task<BucketsResponseDto> DemoteCommittedItemAsync(string itemKey)
    {
        var existing = await supabase.From<BucketCategoryOverride>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Filter("item_key", Operator.Equals, itemKey)
            .Get();

        if (existing.Models.Count == 0)
        {
            await supabase.From<BucketCategoryOverride>().Insert(new BucketCategoryOverride
            {
                Id = Guid.NewGuid(),
                UserId = PlaceholderUserId,
                ItemKey = itemKey,
                Bucket = "free",
                CreatedAt = DateTime.UtcNow,
            });
            logger.LogInformation("Demoted commitment '{Key}' to Free for user {UserId}", itemKey, PlaceholderUserId);
        }

        return await GetBucketsAsync();
    }

    private async Task<HashSet<string>> GetDemotedKeysAsync()
    {
        var result = await supabase.From<BucketCategoryOverride>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Filter("bucket", Operator.Equals, "free")
            .Get();

        return result.Models.Select(m => m.ItemKey).ToHashSet();
    }

    private async Task<BucketSettings?> GetSettingsAsync()
    {
        var result = await supabase.From<BucketSettings>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Get();

        return result.Models.FirstOrDefault();
    }

    private async Task<decimal> GetTotalLiquidAsync()
    {
        var accounts = await supabase.From<Account>()
            .Filter("account_type", Operator.Equals, "Savings")
            .Get();

        if (accounts.Models.Count == 0) return 0m;

        var balances = new List<decimal>();
        foreach (var account in accounts.Models)
        {
            var valuation = await supabase.From<Valuation>()
                .Filter("subject_type", Operator.Equals, "Account")
                .Filter("subject_id", Operator.Equals, account.Id.ToString())
                .Order("valued_at", Ordering.Descending)
                .Limit(1)
                .Get();

            if (valuation.Models.Count > 0)
                balances.Add(valuation.Models[0].ValueIdr);
        }

        // Sum across every account — see BucketCalculator.SumLiquid: the emergency-fund denominator
        // must not shrink just because liquidity happens to be split across banks.
        return BucketCalculator.SumLiquid(balances);
    }

    private static int ComputeCommittedStreak(
        List<Transaction> transactions,
        DateTime closingMonthStart,
        List<DateTime> closingTrailingMonths,
        HashSet<string> committedKeys)
    {
        if (committedKeys.Count == 0) return 0;

        var monthsMostRecentFirst = new List<DateTime> { closingMonthStart }
            .Concat(closingTrailingMonths.OrderByDescending(m => m))
            .ToList();

        var streak = 0;
        foreach (var month in monthsMostRecentFirst)
        {
            var monthKeys = transactions
                .Where(t => t.Date.Year == month.Year && t.Date.Month == month.Month && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
                .Select(t => BucketCalculator.NormalizeDescription(t.Description))
                .ToHashSet();

            if (committedKeys.All(monthKeys.Contains)) streak++;
            else break;
        }
        return streak;
    }

    private static (string? Category, decimal Amount, decimal Usual) FindBiggestDriver(
        List<Transaction> closingMonthTxs,
        List<Transaction> baselineTrailingTxs,
        List<DateTime> closingTrailingMonths)
    {
        var freeCategories = closingMonthTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase) && !BucketCalculator.IsInvestingCategory(t.Category))
            .Select(t => t.Category)
            .Distinct();

        string? bestCategory = null;
        decimal bestAmount = 0m, bestUsual = 0m, bestDelta = 0m;

        foreach (var cat in freeCategories)
        {
            var currentSpend = closingMonthTxs.Where(t => t.Category == cat).Sum(t => t.AmountIdr);
            var trailingAmounts = closingTrailingMonths
                .Select(m => baselineTrailingTxs
                    .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month && t.Category == cat)
                    .Sum(t => t.AmountIdr))
                .ToList();
            var usual = BucketCalculator.Median(trailingAmounts);
            var delta = currentSpend - usual;

            if (delta > bestDelta)
            {
                bestDelta = delta;
                bestCategory = cat;
                bestAmount = currentSpend;
                bestUsual = usual;
            }
        }

        return (bestCategory, Math.Round(bestAmount, 0), Math.Round(bestUsual, 0));
    }

    private async Task<List<Transaction>> FetchTransactionsAsync(DateTime start, DateTime end)
    {
        var all = new List<Transaction>();
        const int pageSize = 1000;
        var offset = 0;
        var hasMore = true;

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
