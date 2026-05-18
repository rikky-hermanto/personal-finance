using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IDashboardService
{
    Task<DashboardDto> GetDashboardDataAsync(Guid? accountId, int? year, int? month, int months = 6);
    Task<CashflowStatementDto> GetCashflowStatementAsync(int months, Guid? accountId, string groupBy);
}
