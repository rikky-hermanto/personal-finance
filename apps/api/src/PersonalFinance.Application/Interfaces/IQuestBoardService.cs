using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IQuestBoardService
{
    Task<QuestBoardDto> GetBoardAsync(Guid userId, CancellationToken ct = default);
    Task<QuestBoardDto> SetFocusAsync(Guid userId, string code, CancellationToken ct = default);
    Task<QuestBoardDto> SnoozeAsync(Guid userId, string code, CancellationToken ct = default);
    Task MarkSeenAsync(Guid userId, IReadOnlyList<long> ids, CancellationToken ct = default);
}
