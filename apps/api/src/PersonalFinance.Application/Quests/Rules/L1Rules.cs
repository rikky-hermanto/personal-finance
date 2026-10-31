using System.Globalization;

namespace PersonalFinance.Application.Quests;

public static class QuestCategories
{
    // The pipeline sets "Uncategorized"; CategoryRuleService returns "Untracked Category"; imports can leave it empty.
    public static bool IsUncategorized(string? category) =>
        string.IsNullOrWhiteSpace(category)
        || category.Equals("Uncategorized", StringComparison.OrdinalIgnoreCase)
        || category.Equals("Untracked Category", StringComparison.OrdinalIgnoreCase);
}

public sealed record TransactionsExist : QuestRule
{
    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest) =>
        [new RungResult(0, ctx.AnyTransaction, NoEvidence)];
}

public sealed record TopExpensesCategorized(int Count) : QuestRule
{
    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest)
    {
        if (!ctx.TransactionsLoaded || ctx.Months.Count == 0) return [new RungResult(0, false, NoEvidence)];
        var month = ctx.Months[0];
        var checkedRows = month.TopExpenses.Take(Count).ToList();
        var met = checkedRows.Count > 0 && checkedRows.All(e => !QuestCategories.IsUncategorized(e.Category));
        var evidence = new Dictionary<string, object?>
        {
            ["month"] = $"{month.Year:0000}-{month.Month:00}",
            ["checked"] = checkedRows.Count,
        };
        return [new RungResult(0, met, evidence)];
    }
}

public sealed record AccountsCovered : QuestRule
{
    public override bool Applies(QuestContext ctx) => ctx.CashflowAccounts.Count > 0;

    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest)
    {
        var total = ctx.CashflowAccounts.Count;
        if (total == 0) return [];
        var covered = ctx.TransactionsLoaded ? ctx.CashflowAccounts.Count(a => a.HasTransactionInWindow) : 0;
        var evidence = new Dictionary<string, object?> { ["covered"] = covered, ["total"] = total };
        return Enumerable.Range(1, total).Select(k => new RungResult(k, covered >= k, evidence)).ToList();
    }

    public override QuestProgress? Progress(QuestContext ctx, QuestDefinition quest)
    {
        var total = ctx.CashflowAccounts.Count;
        if (total == 0) return null;
        var done = Math.Min(DoneRungs(ctx, quest.Code), total);
        return new QuestProgress(done, total, $"{done} of {total} accounts", (decimal)done / total);
    }
}

public sealed record GreenMonth : QuestRule
{
    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest)
    {
        if (!ctx.TransactionsLoaded) return [new RungResult(0, false, NoEvidence)];
        foreach (var m in ctx.Months)
        {
            // One classifier for the quest and the harvest, so they can never disagree (STEP 4).
            if (Services.Harvest.HarvestSummaryBuilder.Classify(m.Income, m.Expense)
                == Services.Harvest.HarvestSummaryBuilder.Green)
            {
                // The completion is permanent while the ledger row keeps refreshing, so it records
                // how many accounts it was based on (G10).
                var (covered, total) = Services.Harvest.HarvestSummaryBuilder.Coverage(
                    ctx.CashflowAccounts.Select(a => a.Id).ToList(), m.AccountIdsWithTransactions);
                var evidence = new Dictionary<string, object?>
                {
                    ["month"] = $"{m.Year:0000}-{m.Month:00}",
                    ["ratio"] = Math.Round(m.Expense / m.Income, 4).ToString(CultureInfo.InvariantCulture),
                    ["covered"] = covered,
                    ["total"] = total,
                };
                return [new RungResult(0, true, evidence)];
            }
        }
        return [new RungResult(0, false, NoEvidence)];
    }
}
