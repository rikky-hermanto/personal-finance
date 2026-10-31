using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Quests;
using PersonalFinance.Application.Services.Harvest;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Services;

public sealed class QuestEngine(IQuestStore store, IHarvestLedger harvestLedger, ILogger<QuestEngine> logger)
    : IQuestEngine
{
    public async Task<IReadOnlyList<QuestCompletion>> EvaluateAsync(
        Guid userId, ScoringSnapshot snapshot, CancellationToken ct = default)
    {
        var existing = await store.LoadCompletionsAsync(userId, ct);
        var accounts = await store.LoadCashflowAccountsAsync(userId, ct);
        var any = await store.AnyTransactionAsync(userId, ct);

        var completed = existing.Select(c => (c.QuestCode, (int)c.Rung)).ToHashSet();
        var ctx = QuestContextFactory.FromSnapshot(snapshot, accounts, any, completed);

        var fresh = new List<QuestCompletion>();
        foreach (var quest in QuestCatalog.V1)
        {
            foreach (var result in quest.Rule.Evaluate(ctx, quest))
            {
                if (!result.Met || completed.Contains((quest.Code, result.Rung))) continue;
                fresh.Add(new QuestCompletion
                {
                    UserId = userId,
                    QuestCode = quest.Code,
                    Rung = (short)result.Rung,
                    CatalogVersion = QuestCatalog.Version,
                    Evidence = new Dictionary<string, object?>(result.Evidence),
                });
            }
        }

        // First pass for a user with no earlier completions: several quests can land at once.
        // Flag the batch so the board folds it into one item instead of a burst of toasts.
        if (existing.Count == 0 && fresh.Count > 1)
            foreach (var row in fresh) row.Evidence["backfill"] = true;

        if (fresh.Count > 0) await store.InsertCompletionsAsync(fresh, ct);
        logger.LogInformation("Quest pass for {UserId}: {New} new completions", userId, fresh.Count);

        // Always refresh the ledger, even when nothing new completed, so a late upload updates "N of M".
        await UpdateHarvestLedgerAsync(ctx, historic: existing.Count > 0, ct);
        return fresh;
    }

    private async Task UpdateHarvestLedgerAsync(QuestContext ctx, bool historic, CancellationToken ct)
    {
        // A failed transaction load must not look like "no months were harvested".
        if (!ctx.TransactionsLoaded) return;

        var accountIds = ctx.CashflowAccounts.Select(a => a.Id).ToList();
        var records = ctx.Months
            .Select(m => HarvestSummaryBuilder.Build(
                new DateOnly(m.Year, m.Month, 1), m.Income, m.Expense, m.TransactionCount,
                accountIds, m.AccountIdsWithTransactions ?? new HashSet<Guid>()))
            .OfType<HarvestMonthRecord>()
            .ToList();
        try
        {
            await harvestLedger.UpsertMonthsAsync(records, insertedAsSeen: historic, ct);
        }
        catch (Exception ex)
        {
            // Same rule as the recalculation trigger: Journey never fails an import.
            logger.LogError(ex, "Could not update the harvest ledger");
        }
    }
}
