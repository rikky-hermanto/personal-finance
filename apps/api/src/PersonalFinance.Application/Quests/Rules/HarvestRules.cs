using PersonalFinance.Application.Services.Harvest;

namespace PersonalFinance.Application.Quests;

/// <summary>Met once any harvested month in the window had spending at or above income. Never shames: the
/// reveal copy is "harvested anyway". Uses the same classifier as the harvest and "In the green".</summary>
public sealed record RedMonthRecorded : QuestRule
{
    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest)
    {
        if (!ctx.TransactionsLoaded) return [new RungResult(0, false, NoEvidence)];

        var red = ctx.Months
            .Where(m => m.TransactionCount > 0
                     && HarvestSummaryBuilder.Classify(m.Income, m.Expense) == HarvestSummaryBuilder.Red)
            .OrderBy(m => m.Year).ThenBy(m => m.Month)
            .FirstOrDefault();

        if (red is null) return [new RungResult(0, false, NoEvidence)];

        // The award is permanent, so it records how many accounts it was based on (G10).
        var (covered, total) = HarvestSummaryBuilder.Coverage(
            ctx.CashflowAccounts.Select(a => a.Id).ToList(), red.AccountIdsWithTransactions);
        return [new RungResult(0, true, new Dictionary<string, object?>
        {
            ["month"] = $"{red.Year:0000}-{red.Month:00}",
            ["covered"] = covered,
            ["total"] = total,
        })];
    }
}
