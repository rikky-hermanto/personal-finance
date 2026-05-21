using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IInsightService
{
    Task<IReadOnlyList<InsightDto>> GetInsightsAsync(CancellationToken ct = default);
    Task<DailyPulseDto> GetDailyPulseAsync(CancellationToken ct = default);
}
