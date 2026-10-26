using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Tests.Quests;

/// <summary>In-memory IHarvestLedger. Records what the engine upserts, and can be told to throw.</summary>
internal sealed class FakeHarvestLedger : IHarvestLedger
{
    public List<HarvestMonthRecord> LastUpsert { get; private set; } = [];
    public bool? LastInsertedAsSeen { get; private set; }
    public int UpsertCalls { get; private set; }
    public bool Throws { get; set; }
    public List<HarvestLedgerRow> Rows { get; } = [];
    public List<(IReadOnlyList<long> Ids, DateOnly? Through)> MarkSeenCalls { get; } = [];

    public Task UpsertMonthsAsync(
        IReadOnlyList<HarvestMonthRecord> months, bool insertedAsSeen = false, CancellationToken ct = default)
    {
        UpsertCalls++;
        if (Throws) throw new InvalidOperationException("ledger down");
        LastUpsert = months.ToList();
        LastInsertedAsSeen = insertedAsSeen;
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<HarvestLedgerRow>> ListAsync(CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<HarvestLedgerRow>>(Rows.ToList());

    public Task MarkSeenAsync(IReadOnlyList<long> completionIds, DateOnly? throughMonth, CancellationToken ct = default)
    {
        MarkSeenCalls.Add((completionIds, throughMonth));
        return Task.CompletedTask;
    }
}
