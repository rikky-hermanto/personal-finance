using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IDashboardService
{
    Task<DashboardDto> GetDashboardDataAsync(string? wallet, int? year, int? month, int months = 6);
    Task<CashflowStatementDto> GetCashflowStatementAsync(int months, string? wallet, string groupBy);
}
