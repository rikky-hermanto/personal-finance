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

    public async Task<DashboardDto> GetDashboardDataAsync(string? wallet, int? year, int? month)
    {
        _logger.LogDebug("Building dashboard data for wallet={Wallet} year={Year} month={Month}", wallet, year, month);

        var currentYear = year ?? DateTime.Now.Year;
        var currentMonth = month ?? DateTime.Now.Month;

        var allTransactions = await _transactionService.GetTransactionsWithBalanceAsync(wallet);
        var yearTransactions = allTransactions.Where(t => t.Date.Year == currentYear).ToList();
        var monthTransactions = yearTransactions.Where(t => t.Date.Month == currentMonth).ToList();

        var totalIncome = yearTransactions.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
        var totalExpenses = yearTransactions.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);

        var monthIncome = monthTransactions.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
        var monthExpenses = monthTransactions.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);
        var monthNet = monthIncome - monthExpenses;

        var prevMonth = currentMonth == 1 ? 12 : currentMonth - 1;
        var prevYear = currentMonth == 1 ? currentYear - 1 : currentYear;
        var prevMonthTransactions = allTransactions.Where(t => t.Date.Year == prevYear && t.Date.Month == prevMonth).ToList();
        var prevMonthIncome = prevMonthTransactions.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
        var prevMonthExpenses = prevMonthTransactions.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);
        var prevMonthNet = prevMonthIncome - prevMonthExpenses;

        var incomeChange = prevMonthIncome != 0 ? ((monthIncome - prevMonthIncome) / prevMonthIncome) * 100 : 0;
        var expenseChange = prevMonthExpenses != 0 ? ((monthExpenses - prevMonthExpenses) / prevMonthExpenses) * 100 : 0;
        var netChange = prevMonthNet != 0 ? ((monthNet - prevMonthNet) / Math.Abs(prevMonthNet)) * 100 : 0;

        var topCategories = monthTransactions
            .Where(t => t.Type == "Expense" && !string.IsNullOrEmpty(t.Category))
            .GroupBy(t => t.Category)
            .Select(g => new DashboardTopCategoryDto(
                g.Key,
                g.Sum(t => t.AmountIdr),
                totalExpenses != 0 ? Math.Round(g.Sum(t => t.AmountIdr) / totalExpenses * 100, 1) : 0))
            .OrderByDescending(x => x.Amount)
            .Take(5)
            .ToList();

        var cashFlow = Enumerable.Range(0, 6)
            .Select(i => DateTime.Now.AddMonths(-i))
            .OrderBy(d => d)
            .Select(targetDate =>
            {
                var monthly = allTransactions.Where(t => t.Date.Year == targetDate.Year && t.Date.Month == targetDate.Month).ToList();
                var inc = monthly.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
                var exp = monthly.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);
                return new DashboardCashFlowDto(targetDate.ToString("MMM yy"), inc, exp, inc - exp);
            })
            .ToList();

        return new DashboardDto(
            new DashboardSummaryDto(totalIncome, totalExpenses, totalIncome - totalExpenses, yearTransactions.Count),
            new DashboardCurrentMonthDto(
                DateTime.Now.ToString("MMMM yyyy"),
                monthIncome, monthExpenses, monthNet,
                Math.Round(incomeChange, 1), Math.Round(expenseChange, 1), Math.Round(netChange, 1)),
            topCategories,
            cashFlow,
            DateTime.Now);
    }
}
