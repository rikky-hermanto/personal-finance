using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using Microsoft.Extensions.Logging;

public class DashboardService : IDashboardService
{
    private readonly ITransactionService _transactionService;
    private readonly ILogger<DashboardService> _logger;

    public DashboardService(ITransactionService transactionService, ILogger<DashboardService> logger)
    {
        _transactionService = transactionService;
        _logger = logger;
    }

    public async Task<DashboardDto> GetDashboardDataAsync(string? wallet, int? year, int? month, int months = 6)
    {
        _logger.LogDebug("Building dashboard data for wallet={Wallet} year={Year} month={Month} months={Months}", wallet, year, month, months);

        var allTransactions = await _transactionService.GetTransactionsWithBalanceAsync(wallet);
        
        DateTime baselineDate = DateTime.Now;
        if (!year.HasValue && !month.HasValue && allTransactions.Any())
        {
            baselineDate = allTransactions.Max(t => t.Date);
        }
        else if (year.HasValue)
        {
            baselineDate = new DateTime(year.Value, month ?? 1, 1);
        }

        var currentYear = baselineDate.Year;
        int monthCount = months > 0 ? months : baselineDate.Month;

        // Current Range Aggregation
        var rangeStartDate = new DateTime(baselineDate.Year, baselineDate.Month, 1).AddMonths(-monthCount + 1);
        var rangeEndDate = new DateTime(baselineDate.Year, baselineDate.Month, DateTime.DaysInMonth(baselineDate.Year, baselineDate.Month), 23, 59, 59);

        var rangeTransactions = allTransactions.Where(t => t.Date >= rangeStartDate && t.Date <= rangeEndDate).ToList();
        var rangeIncome = rangeTransactions.Where(t => t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
        var rangeExpenses = rangeTransactions.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
        var rangeNet = rangeIncome - rangeExpenses;

        // Comparison Period (Previous Range)
        var prevRangeStartDate = rangeStartDate.AddMonths(-monthCount);
        var prevRangeEndDate = rangeStartDate.AddSeconds(-1);
        var prevRangeTransactions = allTransactions.Where(t => t.Date >= prevRangeStartDate && t.Date <= prevRangeEndDate).ToList();

        var prevRangeIncome = prevRangeTransactions.Where(t => t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
        var prevRangeExpenses = prevRangeTransactions.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
        var prevRangeNet = prevRangeIncome - prevRangeExpenses;

        var incomeChange = prevRangeIncome != 0 ? ((rangeIncome - prevRangeIncome) / prevRangeIncome) * 100 : 0;
        var expenseChange = prevRangeExpenses != 0 ? ((rangeExpenses - prevRangeExpenses) / prevRangeExpenses) * 100 : 0;
        var netChange = prevRangeNet != 0 ? ((rangeNet - prevRangeNet) / Math.Abs(prevRangeNet)) * 100 : 0;

        var topCategories = rangeTransactions
            .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(t.Category))
            .GroupBy(t => t.Category)
            .Select(g => new DashboardTopCategoryDto(
                g.Key,
                g.Sum(t => t.AmountIdr),
                rangeExpenses != 0 ? Math.Round(g.Sum(t => t.AmountIdr) / rangeExpenses * 100, 1) : 0))
            .OrderByDescending(x => x.Amount)
            .Take(5)
            .ToList();

        var cashFlow = Enumerable.Range(0, monthCount)
            .Select(i => baselineDate.AddMonths(-i))
            .OrderBy(d => d)
            .Select(targetDate =>
            {
                var monthly = allTransactions.Where(t => t.Date.Year == targetDate.Year && t.Date.Month == targetDate.Month).ToList();
                var inc = monthly.Where(t => t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
                var exp = monthly.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
                return new DashboardCashFlowDto(targetDate.ToString("MMM yy"), inc, exp, inc - exp);
            })
            .ToList();

        // Summary for the baseline year
        var yearTransactions = allTransactions.Where(t => t.Date.Year == currentYear).ToList();
        var totalIncome = yearTransactions.Where(t => t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);
        var totalExpenses = yearTransactions.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr);

        var rangeLabel = months == 1 
            ? baselineDate.ToString("MMMM yyyy") 
            : (months == 0 ? $"YTD {baselineDate.Year}" : $"{monthCount} Months ending {baselineDate:MMM yy}");

        return new DashboardDto(
            new DashboardSummaryDto(totalIncome, totalExpenses, totalIncome - totalExpenses, yearTransactions.Count),
            new DashboardCurrentMonthDto(
                rangeLabel,
                rangeIncome, rangeExpenses, rangeNet,
                Math.Round(incomeChange, 1), Math.Round(expenseChange, 1), Math.Round(netChange, 1)),
            topCategories,
            cashFlow,
            DateTime.Now);
    }
}
