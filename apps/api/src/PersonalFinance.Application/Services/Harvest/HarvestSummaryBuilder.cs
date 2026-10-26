using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Services.Harvest;

public static class HarvestSummaryBuilder
{
    public const string Green = "green";
    public const string Red = "red";
    public const string Neutral = "neutral";

    // Source: docs/ideas/scoring-rubric.md and docs/reference/finance-domain/formulas.md section 1:
    // a spend ratio of 1.00 is the 0-point breakpoint of spend_lt_income. Green means spending stayed
    // under income. No income recorded is neutral, never green (FIN-04).
    public static string Classify(decimal incomeIdr, decimal expenseIdr) =>
        incomeIdr <= 0m ? Neutral : expenseIdr < incomeIdr ? Green : Red;

    /// <summary>"N of M": how many of the cash-flow accounts have a transaction in the month.</summary>
    public static (int Covered, int Total) Coverage(
        IReadOnlyCollection<Guid> cashflowAccountIds, IReadOnlySet<Guid>? accountsWithTransactions) =>
        (accountsWithTransactions is null ? 0 : cashflowAccountIds.Count(accountsWithTransactions.Contains),
         cashflowAccountIds.Count);

    /// <summary>Null when the month has no transactions: nothing was harvested.</summary>
    public static HarvestMonthRecord? Build(
        DateOnly month, decimal incomeIdr, decimal expenseIdr, int transactionCount,
        IReadOnlyCollection<Guid> cashflowAccountIds, IReadOnlySet<Guid> accountsWithTransactions)
    {
        if (transactionCount <= 0) return null;
        var (covered, total) = Coverage(cashflowAccountIds, accountsWithTransactions);
        return new HarvestMonthRecord(
            new DateOnly(month.Year, month.Month, 1), incomeIdr, expenseIdr,
            Classify(incomeIdr, expenseIdr), covered, total);
    }
}
