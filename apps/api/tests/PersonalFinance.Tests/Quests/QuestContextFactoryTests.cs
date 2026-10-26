using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Quests;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Quests;

public class QuestContextFactoryTests
{
    private static readonly DateOnly Today = new(2026, 10, 25);
    private static readonly IReadOnlySet<(string, int)> NoneCompleted = new HashSet<(string, int)>();

    private static Transaction Tx(int y, int m, string type, decimal amount, string category = "Food", Guid? account = null) =>
        new() { Date = new DateTime(y, m, 10), Type = type, AmountIdr = amount, Category = category, AccountId = account };

    private static IndicatorScoreDto Dto(string code, string level, decimal score, decimal? raw, string status = "in_progress") =>
        new(code, level, score, raw, status, code, string.Empty);

    private static ScoringSnapshot Snapshot(
        IReadOnlyList<Transaction>? transactions = null,
        IReadOnlyList<SavingsAccountFact>? savings = null,
        IReadOnlyList<IndicatorScoreDto>? indicators = null,
        bool savingsFailed = false,
        bool transactionsFailed = false) =>
        new(Today,
            transactionsFailed ? null : transactions ?? [],
            savingsFailed ? null : savings ?? [],
            [],
            null,
            true,
            indicators ?? []);

    private static QuestContext Build(ScoringSnapshot s, IReadOnlyList<Account>? accounts = null) =>
        QuestContextFactory.FromSnapshot(s, accounts ?? [], anyTransaction: true, NoneCompleted);

    [Fact]
    public void FromSnapshot_Months_AreTheThreePreviousFullMonths_NewestFirst()
    {
        var ctx = Build(Snapshot());

        Assert.Equal([(2026, 9), (2026, 8), (2026, 7)], ctx.Months.Select(m => (m.Year, m.Month)).ToArray());
    }

    [Fact]
    public void FromSnapshot_ExpenseExcludesSavingsCategories_MatchingTheScoringHelper()
    {
        var ctx = Build(Snapshot([
            Tx(2026, 9, "Income", 1000m, "Salary"),
            Tx(2026, 9, "Expense", 300m, "Food"),
            Tx(2026, 9, "Expense", 400m, "Investment"),
        ]));

        Assert.Equal(300m, ctx.Months[0].Expense);
        Assert.Equal(1000m, ctx.Months[0].Income);
    }

    [Fact]
    public void FromSnapshot_TopExpenses_AreTheFiveLargest()
    {
        var rows = Enumerable.Range(1, 7).Select(i => Tx(2026, 9, "Expense", i * 10m)).ToList();

        var ctx = Build(Snapshot(rows));

        Assert.Equal([70m, 60m, 50m, 40m, 30m], ctx.Months[0].TopExpenses.Select(e => e.AmountIdr).ToArray());
    }

    [Fact]
    public void FromSnapshot_AccountCoverage_UsesOnlyTheThreeFullMonths()
    {
        var inWindow = new Account { Id = Guid.NewGuid(), Name = "BCA" };
        var onlyThisMonth = new Account { Id = Guid.NewGuid(), Name = "Jago" };
        var s = Snapshot([
            Tx(2026, 9, "Expense", 10m, account: inWindow.Id),
            Tx(2026, 10, "Expense", 10m, account: onlyThisMonth.Id),
        ]);

        var ctx = Build(s, [inWindow, onlyThisMonth]);

        Assert.True(ctx.CashflowAccounts.Single(a => a.Name == "BCA").HasTransactionInWindow);
        Assert.False(ctx.CashflowAccounts.Single(a => a.Name == "Jago").HasTransactionInWindow);
    }

    [Fact]
    public void FromSnapshot_TransactionsLoadFailed_FlagsTransactionsNotLoaded()
    {
        var ctx = Build(Snapshot(transactionsFailed: true));

        Assert.False(ctx.TransactionsLoaded);
        Assert.True(ctx.SavingsLoaded);
    }

    private static IReadOnlyList<IndicatorScoreDto> CoverIndicators() =>
        [Dto("liquid_savings_ratio", "L2", 80m, 2.5m), Dto("spend_lt_income", "L1", 90m, 0.85m)];

    private static SavingsAccountFact ValuedOn(DateTime when) => new(Guid.NewGuid(), "Savings", 1m, when);

    [Fact]
    public void FromSnapshot_StaleSavingsValuation_MarksCoverUntrusted()
    {
        var ctx = Build(Snapshot(savings: [ValuedOn(new DateTime(2026, 8, 20))], indicators: CoverIndicators()));

        Assert.False(ctx.Indicators["liquid_savings_ratio"].Trusted);
    }

    [Fact]
    public void FromSnapshot_FreshValuation_CoverTrusted()
    {
        var ctx = Build(Snapshot(savings: [ValuedOn(new DateTime(2026, 9, 2))], indicators: CoverIndicators()));

        Assert.True(ctx.Indicators["liquid_savings_ratio"].Trusted);
    }

    [Fact]
    public void FromSnapshot_SavingsLoadFailed_CoverUntrusted()
    {
        var ctx = Build(Snapshot(savingsFailed: true, indicators: CoverIndicators()));

        Assert.False(ctx.Indicators["liquid_savings_ratio"].Trusted);
        Assert.False(ctx.SavingsLoaded);
    }

    [Fact]
    public void FromSnapshot_OtherIndicators_AlwaysTrusted()
    {
        var ctx = Build(Snapshot(savings: [ValuedOn(new DateTime(2026, 1, 1))], indicators: CoverIndicators()));

        Assert.True(ctx.Indicators["spend_lt_income"].Trusted);
    }

    [Fact]
    public void FromSnapshot_StaleCover_KeepsL2FromGraduating()
    {
        var indicators = new[]
        {
            Dto("spend_lt_income", "L1", 100m, 0.7m),
            Dto("liquid_savings_ratio", "L2", 100m, 3.5m),
        };
        var ctx = Build(Snapshot(savings: [ValuedOn(new DateTime(2026, 6, 1))], indicators: indicators));

        Assert.Equal("L2", ctx.WorkingLevel);
        Assert.DoesNotContain("L2", ctx.GraduatedLevels);
    }

    [Fact]
    public void FromStoredState_UnevaluatedIndicator_IsNotLiveAndNotCleared()
    {
        var ctx = QuestContextFactory.FromStoredState(
            [Dto("spend_lt_income", "L1", 100m, 0.7m), Dto("manageable_dti", "L2", 0m, null, "no_data")],
            [], NoneCompleted, Today);

        Assert.Equal("no_data", ctx.Indicators["manageable_dti"].Status);
        Assert.Contains("L1", ctx.GraduatedLevels);
        Assert.DoesNotContain("L2", ctx.GraduatedLevels);
        Assert.Equal("L2", ctx.WorkingLevel);
    }
}
