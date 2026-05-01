namespace PersonalFinance.Application.Dtos;

public record DashboardSummaryDto(
    decimal TotalIncome,
    decimal TotalExpenses,
    decimal NetWorth,
    int TransactionCount);

public record DashboardCurrentMonthDto(
    string Month,
    decimal Income,
    decimal Expenses,
    decimal Net,
    decimal IncomeChangePercent,
    decimal ExpenseChangePercent,
    decimal NetChangePercent);

public record DashboardTopCategoryDto(
    string Category,
    decimal Amount,
    decimal Percentage);

public record DashboardCashFlowDto(
    string Month,
    decimal Income,
    decimal Expenses,
    decimal Net);

public record DashboardDto(
    DashboardSummaryDto Summary,
    DashboardCurrentMonthDto CurrentMonth,
    List<DashboardTopCategoryDto> TopCategories,
    List<DashboardCashFlowDto> CashFlow,
    DateTime LastUpdated);
