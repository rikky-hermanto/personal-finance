namespace PersonalFinance.Application.Quests;

/// <summary>Trusted = the indicator's input is fresh enough to celebrate (G6). A stale savings balance still
/// feeds the score, but quests and stars must not treat the resulting cover as an achievement.</summary>
public sealed record IndicatorFact(string Code, string Level, decimal Score, decimal? Raw, string Status, bool Trusted = true);
public sealed record ExpenseFact(decimal AmountIdr, string Category);
public sealed record MonthFacts(int Year, int Month, decimal Income, decimal Expense, IReadOnlyList<ExpenseFact> TopExpenses);
public sealed record AccountFact(Guid Id, string Name, bool HasTransactionInWindow);

/// <summary>Read-only facts the rules look at. The write path fills everything; the read path
/// (board) fills only what progress and offers need: indicators, working level, completed, accounts.</summary>
public sealed record QuestContext(
    DateOnly Today,
    IReadOnlyDictionary<string, IndicatorFact> Indicators,
    string WorkingLevel,
    IReadOnlySet<string> GraduatedLevels,
    IReadOnlyList<MonthFacts> Months,               // last 3 full calendar months, newest first
    bool AnyTransaction,
    IReadOnlyList<AccountFact> CashflowAccounts,
    IReadOnlyList<SavingsAccountFact> SavingsAccounts,
    int LiabilityCount,
    bool NoDebtsConfirmed,
    bool TransactionsLoaded,
    bool SavingsLoaded,
    IReadOnlySet<(string Code, int Rung)> Completed);
