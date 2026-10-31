using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Quests;

public static class QuestContextFactory
{
    /// <summary>Write path: everything one scoring pass loaded.</summary>
    public static QuestContext FromSnapshot(
        ScoringSnapshot s,
        IReadOnlyList<Account> cashflowAccounts,
        bool anyTransaction,
        IReadOnlySet<(string Code, int Rung)> completed)
    {
        var transactions = s.Transactions ?? [];

        // Three previous full calendar months, newest first.
        var months = Enumerable.Range(1, 3).Select(i =>
        {
            var m = s.Today.AddMonths(-i);
            var monthStart = new DateTime(m.Year, m.Month, 1);
            var inMonth = transactions
                .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month)
                .ToList();
            var top = inMonth
                .Where(JourneyScoringRules.IsExpense)
                .OrderByDescending(t => t.AmountIdr)
                .Take(5)
                .Select(t => new ExpenseFact(t.AmountIdr, t.Category))
                .ToList();
            // Every transaction in the month counts, not only income and expense rows (the "N of M" basis).
            var accountIds = inMonth
                .Where(t => t.AccountId.HasValue)
                .Select(t => t.AccountId!.Value)
                .ToHashSet();
            return new MonthFacts(
                m.Year, m.Month,
                JourneyScoringRules.MonthTotal(transactions, monthStart, JourneyScoringRules.IsIncome),
                JourneyScoringRules.MonthTotal(transactions, monthStart, JourneyScoringRules.IsConsumption),
                top,
                inMonth.Count,
                accountIds);
        }).ToList();

        var windowKeys = months.Select(m => (m.Year, m.Month)).ToHashSet();
        var accountsWithRows = transactions
            .Where(t => t.AccountId.HasValue && windowKeys.Contains((t.Date.Year, t.Date.Month)))
            .Select(t => t.AccountId!.Value)
            .ToHashSet();
        var accounts = cashflowAccounts
            .Select(a => new AccountFact(a.Id, a.Name, accountsWithRows.Contains(a.Id)))
            .ToList();

        // G6 lives here, once: a cover figure built on a stale valuation is not celebrated.
        var coverFresh = s.SavingsAccounts is not null && ValuationFreshness.AllFresh(s.SavingsAccounts, s.Today);
        var facts = s.Indicators
            .Select(i => new IndicatorFact(i.Code, i.Level, i.Score, i.RawValue, i.Status,
                i.Code != "liquid_savings_ratio" || coverFresh))
            .ToList();
        var (working, cleared) = WorkingLevel.Compute(facts);

        return new QuestContext(
            s.Today,
            facts.ToDictionary(f => f.Code),
            working,
            cleared,
            months,
            anyTransaction,
            accounts,
            s.SavingsAccounts ?? [],
            s.Liabilities?.Count ?? 0,
            s.NoDebtsConfirmedAt is not null,
            s.Transactions is not null,
            s.SavingsAccounts is not null,
            completed);
    }

    /// <summary>Read path (board): stored indicators only, no transactions reloaded.</summary>
    public static QuestContext FromStoredState(
        IReadOnlyList<IndicatorScoreDto> indicators,
        IReadOnlyList<Account> cashflowAccounts,
        IReadOnlySet<(string Code, int Rung)> completed,
        DateOnly today)
    {
        var facts = indicators
            .Select(i => new IndicatorFact(i.Code, i.Level, i.Score, i.RawValue, i.Status))
            .ToList();
        var (working, cleared) = WorkingLevel.Compute(facts);

        return new QuestContext(
            today,
            facts.ToDictionary(f => f.Code),
            working,
            cleared,
            [],
            false,
            cashflowAccounts.Select(a => new AccountFact(a.Id, a.Name, false)).ToList(),
            [],
            0,
            false,
            false,
            false,
            completed);
    }
}
