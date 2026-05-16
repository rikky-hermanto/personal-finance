using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IJourneyScoringService
{
    Task<JourneyStateDto> GetStateAsync(Guid userId, CancellationToken ct = default);
    Task<JourneyStateDto> RecalculateAsync(Guid userId, CancellationToken ct = default);
}
