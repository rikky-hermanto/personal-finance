using PersonalFinance.Application.Quests;
using Xunit;
using static PersonalFinance.Tests.Quests.ContextBuilder;

namespace PersonalFinance.Tests.Quests;

public class L1RuleTests
{
    private static QuestDefinition Quest(string code) => QuestCatalog.Find(code)!;

    private static bool Met(string code, QuestContext ctx, int rung = 0) =>
        Quest(code).Rule.Evaluate(ctx, Quest(code)).Single(r => r.Rung == rung).Met;

    private static ExpenseFact E(string category) => new(100_000m, category);

    [Fact]
    public void TransactionsExist_AnyTransaction_Met() =>
        Assert.True(Met("l1.meet_your_money", Empty() with { AnyTransaction = true }));

    [Fact]
    public void TransactionsExist_None_NotMet() =>
        Assert.False(Met("l1.meet_your_money", Empty()));

    [Fact]
    public void TopExpensesCategorized_AllFiveCategorized_Met()
    {
        var ctx = Empty().WithMonths(Month(2026, 9, 10m, 5m, E("Food"), E("Transport"), E("Bills"), E("Health"), E("Fun")));
        Assert.True(Met("l1.sort_the_pile", ctx));
    }

    [Fact]
    public void TopExpensesCategorized_OneUncategorized_NotMet()
    {
        var ctx = Empty().WithMonths(Month(2026, 9, 10m, 5m, E("Food"), E("Uncategorized"), E("Bills")));
        Assert.False(Met("l1.sort_the_pile", ctx));
    }

    [Theory]
    [InlineData("Untracked Category")]
    [InlineData("")]
    [InlineData("  ")]
    public void TopExpensesCategorized_UntrackedOrBlank_CountsAsUncategorized(string category)
    {
        var ctx = Empty().WithMonths(Month(2026, 9, 10m, 5m, E("Food"), E(category)));
        Assert.False(Met("l1.sort_the_pile", ctx));
    }

    [Fact]
    public void TopExpensesCategorized_NoExpensesLastMonth_NotMet() =>
        Assert.False(Met("l1.sort_the_pile", Empty().WithMonths(Month(2026, 9, 10m, 0m))));

    [Fact]
    public void TopExpensesCategorized_FewerThanFive_ChecksWhatExists() =>
        Assert.True(Met("l1.sort_the_pile", Empty().WithMonths(Month(2026, 9, 10m, 2m, E("Food"), E("Bills")))));

    [Fact]
    public void TopExpensesCategorized_TransactionsNotLoaded_NotMet()
    {
        var ctx = Empty().WithMonths(Month(2026, 9, 10m, 5m, E("Food"))) with { TransactionsLoaded = false };
        Assert.False(Met("l1.sort_the_pile", ctx));
    }

    private static QuestContext WithAccounts(int total, int covered) => Empty() with
    {
        CashflowAccounts = Enumerable.Range(0, total)
            .Select(i => new AccountFact(Guid.NewGuid(), $"A{i}", i < covered)).ToList(),
    };

    [Fact]
    public void AccountsCovered_ThreeOfFive_RungsOneToThreeMet()
    {
        var ctx = WithAccounts(5, 3);
        var results = Quest("l1.full_picture").Rule.Evaluate(ctx, Quest("l1.full_picture"));

        Assert.Equal([1, 2, 3], results.Where(r => r.Met).Select(r => r.Rung).ToList());
        Assert.Equal(5, results.Count);
    }

    [Fact]
    public void AccountsCovered_NoAccounts_DoesNotApply() =>
        Assert.False(Quest("l1.full_picture").Rule.Applies(Empty()));

    [Fact]
    public void AccountsCovered_AddedAccount_AddsARung()
    {
        var before = Quest("l1.full_picture").Rule.Evaluate(WithAccounts(3, 3), Quest("l1.full_picture"));
        var after = Quest("l1.full_picture").Rule.Evaluate(WithAccounts(4, 3), Quest("l1.full_picture"));

        Assert.Equal(before.Count + 1, after.Count);
        Assert.False(after.Last().Met);
    }

    [Fact]
    public void AccountsCovered_Progress_UsesStoredRungs()
    {
        var ctx = WithAccounts(5, 3).WithCompleted(("l1.full_picture", 2));
        var progress = Quest("l1.full_picture").Rule.Progress(ctx, Quest("l1.full_picture"));

        Assert.Equal("2 of 5 accounts", progress!.Label);
    }

    [Fact]
    public void GreenMonth_ExpenseBelowIncome_Met() =>
        Assert.True(Met("l1.in_the_green", Empty().WithMonths(Month(2026, 9, 100m, 80m))));

    [Fact]
    public void GreenMonth_ExpenseEqualsIncome_NotMet() =>
        Assert.False(Met("l1.in_the_green", Empty().WithMonths(Month(2026, 9, 100m, 100m))));

    [Fact]
    public void GreenMonth_ZeroIncomeMonth_NotMet() =>
        Assert.False(Met("l1.in_the_green", Empty().WithMonths(Month(2026, 9, 0m, 0m))));

    [Fact]
    public void GreenMonth_OnlyOneOfThreeMonthsGreen_Met() =>
        Assert.True(Met("l1.in_the_green", Empty().WithMonths(
            Month(2026, 9, 100m, 150m), Month(2026, 8, 100m, 90m), Month(2026, 7, 100m, 120m))));

    [Fact]
    public void GreenMonth_EvidenceCarriesARatioNotAmounts()
    {
        var ctx = Empty().WithMonths(Month(2026, 9, 1000m, 800m));
        var evidence = Quest("l1.in_the_green").Rule.Evaluate(ctx, Quest("l1.in_the_green")).Single().Evidence;

        Assert.Equal("0.8", evidence["ratio"]);
        Assert.DoesNotContain("income", evidence.Keys);
    }

    private static MonthFacts MonthWithAccounts(
        int year, int month, decimal income, decimal expense, int count, IReadOnlySet<Guid> accountIds) =>
        new(year, month, income, expense, [], count, accountIds);

    [Fact]
    public void GreenMonth_PartlyCoveredMonth_StoresCoveredAndTotalInEvidence()
    {
        // Arrange: 4 of 5 accounts have a row in the green month.
        var accounts = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToList();
        var withRows = accounts.Take(4).ToHashSet();
        var ctx = (Empty() with
        {
            CashflowAccounts = accounts.Select(id => new AccountFact(id, "A", true)).ToList(),
        }).WithMonths(MonthWithAccounts(2026, 9, 1000m, 800m, 10, withRows));

        // Act
        var evidence = Quest("l1.in_the_green").Rule.Evaluate(ctx, Quest("l1.in_the_green")).Single().Evidence;

        // Assert
        Assert.Equal(4, evidence["covered"]);
        Assert.Equal(5, evidence["total"]);
    }

    private static bool RedMet(QuestContext ctx) =>
        new RedMonthRecorded().Evaluate(ctx, Quest("l1.honest_harvest")).Single().Met;

    [Fact]
    public void RedMonthRecorded_AMonthRanOver_Met() =>
        Assert.True(RedMet(Empty().WithMonths(MonthWithAccounts(2026, 9, 100m, 150m, 3, new HashSet<Guid>()))));

    [Fact]
    public void RedMonthRecorded_ExpenseEqualsIncome_Met() =>
        Assert.True(RedMet(Empty().WithMonths(MonthWithAccounts(2026, 9, 100m, 100m, 3, new HashSet<Guid>()))));

    [Fact]
    public void RedMonthRecorded_NoIncomeMonth_NotMet() =>
        Assert.False(RedMet(Empty().WithMonths(MonthWithAccounts(2026, 9, 0m, 150m, 3, new HashSet<Guid>()))));

    [Fact]
    public void RedMonthRecorded_NoTransactionsInMonth_NotMet() =>
        Assert.False(RedMet(Empty().WithMonths(MonthWithAccounts(2026, 9, 100m, 150m, 0, new HashSet<Guid>()))));

    [Fact]
    public void RedMonthRecorded_TransactionsNotLoaded_NotMet() =>
        Assert.False(RedMet((Empty() with { TransactionsLoaded = false })
            .WithMonths(MonthWithAccounts(2026, 9, 100m, 150m, 3, new HashSet<Guid>()))));

    [Fact]
    public void RedMonthRecorded_PartlyCoveredMonth_StoresCoveredAndTotal()
    {
        // Arrange
        var accounts = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToList();
        var withRows = accounts.Take(4).ToHashSet();
        var ctx = (Empty() with
        {
            CashflowAccounts = accounts.Select(id => new AccountFact(id, "A", true)).ToList(),
        }).WithMonths(MonthWithAccounts(2026, 9, 100m, 150m, 10, withRows));

        // Act
        var evidence = new RedMonthRecorded().Evaluate(ctx, Quest("l1.honest_harvest")).Single().Evidence;

        // Assert
        Assert.Equal(4, evidence["covered"]);
        Assert.Equal(5, evidence["total"]);
    }
}
