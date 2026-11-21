using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Quests;

namespace PersonalFinance.Application.Interfaces;

public interface IJourneyScoringService
{
    Task<JourneyStateDto> GetStateAsync(Guid userId, CancellationToken ct = default);
    Task<JourneyStateDto> RecalculateAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Recalculate and return both the state and the snapshot the pass loaded, so the quest
    /// engine can run from the same inputs without a second round of queries.</summary>
    Task<JourneyRecalculation> RecalculateWithSnapshotAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Read-only: load the scoring inputs and compute the indicators exactly as a recalculation would,
    /// without persisting state, snapshots or achievements (PF-154 foundation check).</summary>
    Task<ScoringSnapshot> LoadSnapshotAsync(Guid userId, CancellationToken ct = default);
}
