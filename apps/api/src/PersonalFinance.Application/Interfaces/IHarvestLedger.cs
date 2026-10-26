using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

/// <summary>The owner's harvested months. The owner is the signed-in caller; no method takes a user id.</summary>
public interface IHarvestLedger
{
    /// <summary>Insert or refresh month figures. Never changes whether an existing month was seen.
    /// <paramref name="insertedAsSeen"/> applies only to new rows written while the owner's ledger is still
    /// empty (history from before this feature); the database decides, so a stale flag cannot hide a real harvest.</summary>
    Task UpsertMonthsAsync(
        IReadOnlyList<HarvestMonthRecord> months, bool insertedAsSeen = false, CancellationToken ct = default);

    Task<IReadOnlyList<HarvestLedgerRow>> ListAsync(CancellationToken ct = default);

    /// <summary>Marks the completions, and every ledger month up to <paramref name="throughMonth"/>, as seen.</summary>
    Task MarkSeenAsync(IReadOnlyList<long> completionIds, DateOnly? throughMonth, CancellationToken ct = default);
}
