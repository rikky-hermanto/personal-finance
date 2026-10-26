using PersonalFinance.Application.Quests;
using Xunit;
using static PersonalFinance.Tests.Quests.ContextBuilder;

namespace PersonalFinance.Tests.Quests;

public class L2RuleTests
{
    private static QuestDefinition Fence => QuestCatalog.Find("l2.fence_posts")!;

    private static IReadOnlyList<int> MetRungs(QuestDefinition quest, QuestContext ctx) =>
        quest.Rule.Evaluate(ctx, quest).Where(r => r.Met).Select(r => r.Rung).ToList();

    private static SavingsAccountFact Savings(DateTime? valuedAt) => new(Guid.NewGuid(), "Savings", 5_000_000m, valuedAt);

    [Fact]
    public void RawValueAtLeast_149Months_RungOnePointFiveNotMet() =>
        Assert.Equal([1, 2], MetRungs(Fence, Empty().WithIndicator(Cover(1.49m))));

    [Fact]
    public void RawValueAtLeast_150Months_Met() =>
        Assert.Equal([1, 2, 3], MetRungs(Fence, Empty().WithIndicator(Cover(1.5m))));

    [Fact]
    public void RawValueAtLeast_FreshValuation_CompletesRungsOneToThree_At160() =>
        Assert.Equal([1, 2, 3], MetRungs(Fence, Empty().WithIndicator(Cover(1.6m))));

    [Fact]
    public void RawValueAtLeast_UntrustedCover_CompletesNothing() =>
        Assert.Empty(MetRungs(Fence, Empty().WithIndicator(Cover(1.6m, trusted: false))));

    [Fact]
    public void RawValueAtLeast_IndicatorNoData_CompletesNothing() =>
        Assert.Empty(MetRungs(Fence, Empty().WithIndicator(
            new IndicatorFact("liquid_savings_ratio", "L2", 0m, 2m, "no_data"))));

    [Fact]
    public void RawValueAtLeast_SavingsLoadFailed_CompletesNothing() =>
        Assert.Empty(MetRungs(Fence, Empty().WithIndicator(Cover(2m)) with { SavingsLoaded = false }));

    [Fact]
    public void RawValueAtLeast_Progress_ReportsPostsAndMonths()
    {
        var ctx = Empty().WithIndicator(Cover(1.1m)).WithCompleted(("l2.fence_posts", 2));
        var progress = Fence.Rule.Progress(ctx, Fence)!;

        Assert.Equal("2 of 6 posts · 1.1 months", progress.Label);
        Assert.Equal(0.2m, progress.Fraction);
    }

    [Fact]
    public void RawValueAtLeast_Progress_AllRungsDone_IsFull()
    {
        var ctx = Empty().WithIndicator(Cover(3.2m)).WithCompleted(("l2.fence_posts", 6));
        Assert.Equal(1m, Fence.Rule.Progress(ctx, Fence)!.Fraction);
    }

    [Fact]
    public void RawValueAtLeast_Evidence_NamesNewestValuationDate()
    {
        var ctx = Empty().WithIndicator(Cover(1m)) with
        {
            SavingsAccounts = [Savings(new DateTime(2026, 9, 3)), Savings(new DateTime(2026, 10, 2))],
        };
        var evidence = Fence.Rule.Evaluate(ctx, Fence).First().Evidence;

        Assert.Equal("2026-10-02", evidence["valuedAt"]);
    }

    private static QuestDefinition Star(string code) => QuestCatalog.Find($"stars.{code}")!;

    [Fact]
    public void IndicatorScoreAtLeast_UntrustedCover_EarnsNoStar() =>
        Assert.Empty(MetRungs(Star("liquid_savings_ratio"), Empty().WithIndicator(Cover(2.5m, trusted: false, score: 80m))));

    [Fact]
    public void IndicatorScoreAtLeast_NoData_EarnsNoStar() =>
        Assert.Empty(MetRungs(Star("manageable_dti"), Empty().WithIndicator(
            new IndicatorFact("manageable_dti", "L2", 0m, null, "no_data"))));

    [Fact]
    public void IndicatorScoreAtLeast_Score70_EarnsTwoStars() =>
        Assert.Equal([1, 2], MetRungs(Star("spend_lt_income"), Empty().WithIndicator(
            new IndicatorFact("spend_lt_income", "L1", 70m, 0.89m, "achieved"))));

    [Fact]
    public void IndicatorScoreAtLeast_ScoreDropsLater_StillReportsCurrentRungsOnly() =>
        Assert.Equal([1], MetRungs(Star("spend_lt_income"), Empty().WithIndicator(
            new IndicatorFact("spend_lt_income", "L1", 55m, 0.93m, "in_progress"))));

    [Fact]
    public void DebtsMapped_OneLiability_Met() =>
        Assert.Equal([0], MetRungs(QuestCatalog.Find("l2.map_your_debts")!, Empty() with { LiabilityCount = 1 }));

    [Fact]
    public void DebtsMapped_NoDebtsConfirmedWithNoLiabilities_Met() =>
        Assert.Equal([0], MetRungs(QuestCatalog.Find("l2.map_your_debts")!, Empty() with { NoDebtsConfirmed = true }));

    [Fact]
    public void DebtsMapped_NothingRecorded_NotMet() =>
        Assert.Empty(MetRungs(QuestCatalog.Find("l2.map_your_debts")!, Empty()));

    [Fact]
    public void ValuationExists_Valued_Met() =>
        Assert.Equal([0], MetRungs(QuestCatalog.Find("l2.count_your_cushion")!,
            Empty() with { SavingsAccounts = [Savings(new DateTime(2026, 10, 1))] }));

    [Fact]
    public void ValuationExists_AccountWithoutValuation_NotMet() =>
        Assert.Empty(MetRungs(QuestCatalog.Find("l2.count_your_cushion")!,
            Empty() with { SavingsAccounts = [Savings(null)] }));

    [Fact]
    public void LevelGraduated_Cleared_Met() =>
        Assert.Equal([0], MetRungs(QuestCatalog.Find("l1.boss")!, Empty() with { GraduatedLevels = new HashSet<string> { "L1" } }));

    [Fact]
    public void LevelGraduated_NotCleared_NotMet() =>
        Assert.Empty(MetRungs(QuestCatalog.Find("l1.boss")!, Empty()));
}
