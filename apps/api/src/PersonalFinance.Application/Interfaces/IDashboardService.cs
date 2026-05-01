using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IDashboardService
{
    Task<DashboardDto> GetDashboardDataAsync(string? wallet, int? year, int? month);
}
