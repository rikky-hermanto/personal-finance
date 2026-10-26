using PersonalFinance.Application.Quests;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Interfaces;

public interface IQuestEngine
{
    /// <summary>Runs every detector on the snapshot and stores the rungs that are newly met.
    /// Returns what was stored. Never changes a score.</summary>
    Task<IReadOnlyList<QuestCompletion>> EvaluateAsync(Guid userId, ScoringSnapshot snapshot, CancellationToken ct = default);
}
