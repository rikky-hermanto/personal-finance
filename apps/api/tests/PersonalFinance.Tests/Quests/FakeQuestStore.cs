using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Tests.Quests;

/// <summary>In-memory IQuestStore. Enforces the table's unique key (user_id, quest_code, rung) like the real
/// insert-or-ignore, so a second insert of the same rung is silently dropped.</summary>
internal sealed class FakeQuestStore : IQuestStore
{
    private long _nextId = 1;

    public List<QuestCompletion> Completions { get; } = [];
    public List<Account> Accounts { get; } = [];
    public bool AnyTransaction { get; set; }
    public string? Focus { get; private set; }
    public Dictionary<string, string> Snoozes { get; private set; } = new();
    public int InsertCalls { get; private set; }

    public Task<IReadOnlyList<QuestCompletion>> LoadCompletionsAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<QuestCompletion>>(Completions.Where(c => c.UserId == userId).ToList());

    public Task<IReadOnlyList<Account>> LoadCashflowAccountsAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Account>>(Accounts.ToList());

    public Task<bool> AnyTransactionAsync(Guid userId, CancellationToken ct = default) => Task.FromResult(AnyTransaction);

    public Task<QuestStateRow> LoadStateAsync(Guid userId, CancellationToken ct = default) =>
        Task.FromResult(new QuestStateRow(null, Focus, new Dictionary<string, string>(Snoozes)));

    public Task InsertCompletionsAsync(IReadOnlyList<QuestCompletion> rows, CancellationToken ct = default)
    {
        InsertCalls++;
        foreach (var row in rows)
        {
            if (Completions.Any(c => c.UserId == row.UserId && c.QuestCode == row.QuestCode && c.Rung == row.Rung)) continue;
            row.Id = _nextId++;
            row.CompletedAt = DateTime.UtcNow;
            Completions.Add(row);
        }
        return Task.CompletedTask;
    }

    public Task SetFocusAsync(Guid userId, string? questCode, CancellationToken ct = default)
    {
        Focus = questCode;
        return Task.CompletedTask;
    }

    public Task SetSnoozesAsync(Guid userId, IReadOnlyDictionary<string, string> snoozes, CancellationToken ct = default)
    {
        Snoozes = new Dictionary<string, string>(snoozes);
        return Task.CompletedTask;
    }

    public Task MarkSeenAsync(Guid userId, IReadOnlyList<long> ids, DateTime seenAtUtc, CancellationToken ct = default)
    {
        foreach (var c in Completions.Where(c => ids.Contains(c.Id) && c.SeenAt is null)) c.SeenAt = seenAtUtc;
        return Task.CompletedTask;
    }
}
