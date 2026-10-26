using PersonalFinance.Application.Quests;
using Xunit;

namespace PersonalFinance.Tests.Quests;

public class ValuationFreshnessTests
{
    private static readonly DateOnly Today = new(2026, 10, 25);

    private static SavingsAccountFact Acct(DateTime? valuedAt) => new(Guid.NewGuid(), "Savings", 1_000_000m, valuedAt);

    [Fact]
    public void ValuationFreshness_FirstDayOfPreviousMonth_IsFresh() =>
        Assert.True(ValuationFreshness.AllFresh([Acct(new DateTime(2026, 9, 1))], Today));

    [Fact]
    public void ValuationFreshness_LastDayOfTwoMonthsAgo_IsStale() =>
        Assert.False(ValuationFreshness.AllFresh([Acct(new DateTime(2026, 8, 31))], Today));

    [Fact]
    public void ValuationFreshness_NoValuations_IsFalse() =>
        Assert.False(ValuationFreshness.AllFresh([Acct(null)], Today));

    [Fact]
    public void ValuationFreshness_OneStaleOfTwoAccounts_IsFalse() =>
        Assert.False(ValuationFreshness.AllFresh(
            [Acct(new DateTime(2026, 10, 1)), Acct(new DateTime(2026, 7, 1))], Today));

    [Fact]
    public void ValuationFreshness_UndatedAccountDoesNotBlock() =>
        Assert.True(ValuationFreshness.AllFresh([Acct(new DateTime(2026, 10, 1)), Acct(null)], Today));
}
