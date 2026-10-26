using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Interfaces;

/// <summary>Every database read and write the quest engine and board need. The write surface is
/// deliberately tiny: completions, focus, snoozes, seen. Nothing here can write a score (G1).</summary>
public interface IQuestStore
{
    Task<IReadOnlyList<QuestCompletion>> LoadCompletionsAsync(Guid userId, CancellationToken ct = default);
    Task<IReadOnlyList<Account>> LoadCashflowAccountsAsync(Guid userId, CancellationToken ct = default);
    Task<bool> AnyTransactionAsync(Guid userId, CancellationToken ct = default);
    Task<QuestStateRow> LoadStateAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Inserts new rungs; a row that already exists is ignored, never overwritten.</summary>
    Task InsertCompletionsAsync(IReadOnlyList<QuestCompletion> rows, CancellationToken ct = default);
    Task SetFocusAsync(Guid userId, string? questCode, CancellationToken ct = default);
    Task SetSnoozesAsync(Guid userId, IReadOnlyDictionary<string, string> snoozes, CancellationToken ct = default);
    Task MarkSeenAsync(Guid userId, IReadOnlyList<long> ids, DateTime seenAtUtc, CancellationToken ct = default);
}

public sealed record QuestStateRow(
    UserJourneyState? Scores,                       // scores + IndicatorRaw, null if no pass has ever run
    string? FocusQuestCode,
    IReadOnlyDictionary<string, string> Snoozes);
