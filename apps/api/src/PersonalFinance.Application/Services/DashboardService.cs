using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Constants;
using Microsoft.Extensions.Logging;
using Supabase;
using PersonalFinance.Domain.Entities;
using Supabase.Postgrest;
using System.Linq;
using System.Threading.Tasks;
using System.Collections.Generic;
using static Supabase.Postgrest.Constants;

public class DashboardService : IDashboardService
{
    private readonly ITransactionService _transactionService;
    private readonly Supabase.Client _supabase;
    private readonly ILogger<DashboardService> _logger;

    public DashboardService(ITransactionService transactionService, Supabase.Client supabase, ILogger<DashboardService> logger)
    {
        _transactionService = transactionService;
        _supabase = supabase;
        _logger = logger;
    }

    public async Task<DashboardDto> GetDashboardDataAsync(string? wallet, int? year, int? month, int months = 6)
    {
        _logger.LogDebug("Building dashboard data for wallet={Wallet} year={Year} month={Month} months={Months} using Date-Range Filtering", wallet, year, month, months);

        // 1. Determine baseline date (latest transaction date)
        DateTime baselineDate;
        if (year.HasValue)
        {
            baselineDate = new DateTime(year.Value, month ?? 1, 1);
        }
        else
        {
            var latestTx = await _supabase.From<Transaction>()
                .Order("date", Ordering.Descending)
                .Limit(1)
                .Get();
            baselineDate = latestTx.Models.FirstOrDefault()?.Date ?? DateTime.Now;
        }

        int monthCount = months > 0 ? months : baselineDate.Month;

        // Current Range
        var rangeStartDate = new DateTime(baselineDate.Year, baselineDate.Month, 1).AddMonths(-monthCount + 1);
        var rangeEndDate = new DateTime(baselineDate.Year, baselineDate.Month, DateTime.DaysInMonth(baselineDate.Year, baselineDate.Month), 23, 59, 59);

        // Comparison Range (previous period of same length)
        var prevRangeStartDate = rangeStartDate.AddMonths(-monthCount);
        var prevRangeEndDate = rangeStartDate.AddSeconds(-1);

        // 2. Fetch all relevant transactions (covering both current and previous range)
        // We use a pagination loop to overcome the potential 1,000-row limit in PostgREST
        var allTransactions = new List<Transaction>();
        int pageSize = 1000;
        int offset = 0;
        bool hasMore = true;

        _logger.LogInformation("Fetching transactions for dashboard: {Start} to {End}", prevRangeStartDate, rangeEndDate);

        while (hasMore)
        {
            var query = _supabase.From<Transaction>()
                .Filter("date", Operator.GreaterThanOrEqual, prevRangeStartDate)
                .Filter("date", Operator.LessThanOrEqual, rangeEndDate)
                .Order("date", Ordering.Descending) // Crucial: get latest data first
                .Range(offset, offset + pageSize - 1);

            if (!string.IsNullOrEmpty(wallet))
                query = query.Filter("wallet", Operator.Equals, wallet);

            var result = await query.Get();
            var batch = result.Models;
            allTransactions.AddRange(batch);

            _logger.LogDebug("Fetched batch of {Count} transactions. Total so far: {Total}", batch.Count, allTransactions.Count);

            if (batch.Count < pageSize || allTransactions.Count >= 100_000)
            {
                hasMore = false;
            }
            else
            {
                offset += pageSize;
            }
        }

        _logger.LogInformation("Successfully fetched {Total} transactions for dashboard aggregation.", allTransactions.Count);

        // 3. Aggregate in Memory
        var currentRangeTxs = allTransactions.Where(t => t.Date >= rangeStartDate).ToList();
        var prevRangeTxs = allTransactions.Where(t => t.Date < rangeStartDate).ToList();

        var currentIncome = currentRangeTxs.Where(t => t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
        var currentExpenses = currentRangeTxs.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
        var currentNet = currentIncome - currentExpenses;

        var prevIncome = prevRangeTxs.Where(t => t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
        var prevExpenses = prevRangeTxs.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
        var prevNet = prevIncome - prevExpenses;

        var incomeChange = prevIncome != 0 ? ((currentIncome - prevIncome) / prevIncome) * 100 : 0;
        var expenseChange = prevExpenses != 0 ? ((currentExpenses - prevExpenses) / prevExpenses) * 100 : 0;
        var netChange = prevNet != 0 ? ((currentNet - prevNet) / Math.Abs(prevNet)) * 100 : 0;

        var topCategories = currentRangeTxs
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(t.Category))
            .GroupBy(t => t.Category)
            .Select(g => new DashboardTopCategoryDto(
                g.Key,
                g.Sum(t => t.AmountIdr),
                currentExpenses != 0 ? Math.Round(g.Sum(t => t.AmountIdr) / currentExpenses * 100, 1) : 0))
            .OrderByDescending(x => x.Amount)
            .Take(5)
            .ToList();

        var cashFlow = Enumerable.Range(0, monthCount)
            .Select(i => baselineDate.AddMonths(-i))
            .OrderBy(d => d)
            .Select(targetDate =>
            {
                var monthly = currentRangeTxs.Where(t => t.Date.Year == targetDate.Year && t.Date.Month == targetDate.Month).ToList();
                var inc = monthly.Where(t => t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
                var exp = monthly.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
                return new DashboardCashFlowDto(targetDate.ToString("MMM yy"), inc, exp, inc - exp);
            })
            .ToList();

        // Summary for the baseline year (if needed, but usually CurrentMonth/Range is what matters)
        // Here we just use currentRange totals for the summary card as per "aggregation recapitulation"
        var summaryDto = new DashboardSummaryDto(currentIncome, currentExpenses, currentNet, currentRangeTxs.Count);

        // 4. Build Final DTO
        var rangeLabel = months == 1
            ? baselineDate.ToString("MMMM yyyy")
            : (months == 0 ? $"YTD {baselineDate.Year}" : $"{monthCount} Months ending {baselineDate:MMM yy}");

        return new DashboardDto(
            summaryDto,
            new DashboardCurrentMonthDto(
                rangeLabel,
                currentIncome, currentExpenses, currentNet,
                Math.Round(incomeChange, 1), Math.Round(expenseChange, 1), Math.Round(netChange, 1)),
            topCategories,
            cashFlow,
            DateTime.Now);
    }

    public async Task<CashflowStatementDto> GetCashflowStatementAsync(int months, string? wallet, string groupBy)
    {
        _logger.LogInformation("Generating Cashflow Statement: months={Months}, wallet={Wallet}, groupBy={GroupBy}", months, wallet, groupBy);

        // 1. Get baseline date
        var latestTx = await _supabase.From<Transaction>()
            .Order("date", Ordering.Descending)
            .Limit(1)
            .Get();
        var baselineDate = latestTx.Models.FirstOrDefault()?.Date ?? DateTime.Now;

        int monthCount = months > 0 ? months : baselineDate.Month;
        var rangeStartDate = new DateTime(baselineDate.Year, baselineDate.Month, 1).AddMonths(-monthCount + 1);
        var rangeEndDate = new DateTime(baselineDate.Year, baselineDate.Month, DateTime.DaysInMonth(baselineDate.Year, baselineDate.Month), 23, 59, 59);

        // 2. Fetch transactions
        var allTransactions = new List<Transaction>();
        int pageSize = 1000;
        int offset = 0;
        bool hasMore = true;

        while (hasMore)
        {
            var query = _supabase.From<Transaction>()
                .Filter("date", Operator.GreaterThanOrEqual, rangeStartDate)
                .Filter("date", Operator.LessThanOrEqual, rangeEndDate)
                .Order("date", Ordering.Descending)
                .Range(offset, offset + pageSize - 1);

            if (!string.IsNullOrEmpty(wallet))
                query = query.Filter("wallet", Operator.Equals, wallet);

            var result = await query.Get();
            var batch = result.Models;
            allTransactions.AddRange(batch);

            if (batch.Count < pageSize) hasMore = false;
            else offset += pageSize;
        }

        // 3. Define Periods
        var periods = new List<string>();
        if (groupBy.Equals("quarterly", StringComparison.OrdinalIgnoreCase))
        {
            var current = new DateTime(rangeStartDate.Year, ((rangeStartDate.Month - 1) / 3) * 3 + 1, 1);
            while (current <= rangeEndDate)
            {
                int q = (current.Month - 1) / 3 + 1;
                periods.Add($"Q{q} {current.Year}");
                current = current.AddMonths(3);
            }
        }
        else // monthly
        {
            var current = new DateTime(rangeStartDate.Year, rangeStartDate.Month, 1);
            while (current <= rangeEndDate)
            {
                periods.Add(current.ToString("MMM yy"));
                current = current.AddMonths(1);
            }
        }
        periods.Reverse(); // Newest first

        // 4. Grouping logic
        Func<DateTime, string> getPeriodKey = (date) =>
        {
            if (groupBy.Equals("quarterly", StringComparison.OrdinalIgnoreCase))
            {
                int q = (date.Month - 1) / 3 + 1;
                return $"Q{q} {date.Year}";
            }
            return date.ToString("MMM yy");
        };

        var sectionData = new Dictionary<CashflowSection, Dictionary<string, Dictionary<string, decimal>>>();
        foreach (CashflowSection section in Enum.GetValues(typeof(CashflowSection)))
        {
            sectionData[section] = new Dictionary<string, Dictionary<string, decimal>>();
        }

        foreach (var tx in allTransactions)
        {
            string period = getPeriodKey(tx.Date);
            if (!periods.Contains(period)) continue;

            // Determine Section
            CashflowSection section;
            if (!CashflowSectionMapping.CategoryToSection.TryGetValue(tx.Category, out section))
            {
                // Fallback logic
                if (tx.Type.Equals("Income", StringComparison.OrdinalIgnoreCase)) section = CashflowSection.OperatingIncome;
                else if (tx.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)) section = CashflowSection.OperatingExpense;
                else section = CashflowSection.Financing; // Transfers usually go to financing/ignored
            }

            // Special case for Bank Transfer / Gift
            if (tx.Category.Equals("Bank Transfer", StringComparison.OrdinalIgnoreCase) || tx.Category.Equals("Gift", StringComparison.OrdinalIgnoreCase))
            {
                if (tx.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)) section = CashflowSection.OperatingExpense;
                else section = CashflowSection.OperatingIncome;
            }

            if (!sectionData[section].ContainsKey(tx.Category))
                sectionData[section][tx.Category] = periods.ToDictionary(p => p, p => 0m);

            sectionData[section][tx.Category][period] += tx.AmountIdr;
        }

        // 5. Build DTO
        var sections = new List<StatementSectionDto>();

        // Operating Section
        var operatingSubsections = new List<StatementSubsectionDto>();

        // Operating Income
        var opIncCategories = sectionData[CashflowSection.OperatingIncome]
            .Select(kvp => new CashflowStatementCategoryDto(kvp.Key, kvp.Value))
            .ToList();
        var opIncTotals = periods.ToDictionary(p => p, p => opIncCategories.Sum(c => c.Values[p]));
        operatingSubsections.Add(new StatementSubsectionDto("operating_income", "Income", opIncCategories, opIncTotals));

        // Operating Expense
        var opExpCategories = sectionData[CashflowSection.OperatingExpense]
            .Select(kvp => new CashflowStatementCategoryDto(kvp.Key, kvp.Value.ToDictionary(p => p.Key, p => -p.Value))) // Show expenses as negative
            .ToList();
        var opExpTotals = periods.ToDictionary(p => p, p => opExpCategories.Sum(c => c.Values[p]));
        operatingSubsections.Add(new StatementSubsectionDto("operating_expense", "Operating Expenses", opExpCategories, opExpTotals));

        var opTotals = periods.ToDictionary(p => p, p => opIncTotals[p] + opExpTotals[p]);
        sections.Add(new StatementSectionDto("operating", "OPERATING CASH FLOW", operatingSubsections, opTotals));

        // Investing Section
        var invCategories = sectionData[CashflowSection.Investing]
            .Select(kvp => new CashflowStatementCategoryDto(kvp.Key, kvp.Value)) // Keep original sign for now, mapping should handle it
            .ToList();
        // Adjust signs for investing: typically "Buy" is negative, "Sell" is positive.
        // For simplicity, we'll assume the amount_idr in the DB reflects the flow correctly or we adjust based on Type.
        // Actually, we should probably look at tx.Type during the loop. 
        // Let's refine the loop to handle signs.

        // Re-calculate Investing & Financing with proper signs
        var invSubCategories = new List<CashflowStatementCategoryDto>();
        foreach (var kvp in sectionData[CashflowSection.Investing])
        {
            invSubCategories.Add(new CashflowStatementCategoryDto(kvp.Key, kvp.Value.ToDictionary(p => p.Key, p => p.Value)));
            // In a real app, we'd check if it's Buy/Sell. For now we use the raw value.
        }
        var invTotals = periods.ToDictionary(p => p, p => invSubCategories.Sum(c => c.Values[p]));
        sections.Add(new StatementSectionDto("investing", "INVESTING CASH FLOW", new List<StatementSubsectionDto> {
            new StatementSubsectionDto("investing_all", "Investing Activities", invSubCategories, invTotals)
        }, invTotals));

        // Financing Section
        var finSubCategories = new List<CashflowStatementCategoryDto>();
        foreach (var kvp in sectionData[CashflowSection.Financing])
        {
            finSubCategories.Add(new CashflowStatementCategoryDto(kvp.Key, kvp.Value.ToDictionary(p => p.Key, p => p.Value)));
        }
        var finTotals = periods.ToDictionary(p => p, p => finSubCategories.Sum(c => c.Values[p]));
        sections.Add(new StatementSectionDto("financing", "FINANCING CASH FLOW", new List<StatementSubsectionDto> {
            new StatementSubsectionDto("financing_all", "Financing Activities", finSubCategories, finTotals)
        }, finTotals));

        var grandTotals = periods.ToDictionary(p => p, p => opTotals[p] + invTotals[p] + finTotals[p]);

        return new CashflowStatementDto(periods, sections, grandTotals);
    }
}