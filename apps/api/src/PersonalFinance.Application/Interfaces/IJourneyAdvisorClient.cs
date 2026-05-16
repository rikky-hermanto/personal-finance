using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IJourneyAdvisorClient
{
    Task<List<JourneyQuestDto>> GenerateQuestsAsync(JourneyStateDto state, CancellationToken ct = default);
}
