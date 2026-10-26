using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services.Harvest;

namespace PersonalFinance.Tests.Services.Harvest;

public class HarvestAssemblerTests
{
    private static Dictionary<string, object?> Ev(params (string Key, object? Value)[] pairs) =>
        pairs.ToDictionary(p => p.Key, p => p.Value);

    private static HarvestMonthRecord September(string result = "green", int covered = 4, int total = 5) =>
        new(new DateOnly(2026, 9, 1), 10_000_000m, 8_000_000m, result, covered, total);

    [Fact]
    public void Build_TwoUnseenCompletions_ReturnsExactlyThoseTwoCardsQuestBeforeStar()
    {
        // Arrange
        var unseen = new List<HarvestInputItem>
        {
            new(42, "l2.count_your_cushion", "Count your cushion", Ev(("months", 1.4)), false, new DateTime(2026, 10, 3)),
            new(41, "stars.spend_lt_income", "⭐⭐ Spending under 89% of income", Ev(), false, new DateTime(2026, 10, 3)),
        };

        // Act
        var harvest = HarvestAssembler.Build(unseen, [September()], gardenTotal: 7);

        // Assert
        Assert.NotNull(harvest);
        Assert.Equal(2, harvest.Items.Count);
        Assert.Equal([42L], harvest.Items[0].CompletionIds);   // the quest first
        Assert.Equal([41L], harvest.Items[1].CompletionIds);   // then the star, although its id is lower
        Assert.Equal("You are covered for 1.4 months.", harvest.Items[0].Line);
        Assert.Equal(5, harvest.GardenBefore);
        Assert.Equal(7, harvest.GardenAfter);
    }

    [Fact]
    public void Build_NothingUnseenAndNoUnseenMonth_ReturnsNull()
    {
        // This is what the API returns after the reveal was marked seen: it never replays.
        Assert.Null(HarvestAssembler.Build([], [], gardenTotal: 7));
    }

    [Fact]
    public void Build_MonthWithMissingAccount_StatesFourOfFive()
    {
        // Act
        var harvest = HarvestAssembler.Build([], [September(covered: 4, total: 5)], 3);

        // Assert
        Assert.NotNull(harvest);
        Assert.Equal("September harvested", harvest.Title);
        Assert.Equal("Based on 4 of 5 accounts", harvest.Basis);
        Assert.Equal("2026-09", harvest.Month);
    }

    [Fact]
    public void Build_RedMonthWithANewCompletion_UsesNeutralClosingCopy()
    {
        // Arrange
        var unseen = new List<HarvestInputItem>
        {
            new(5, "l1.honest_harvest", "Honest Harvest", Ev(), false, DateTime.UtcNow),
        };

        // Act
        var harvest = HarvestAssembler.Build(unseen, [September(result: "red", covered: 5, total: 5)], 3);

        // Assert
        Assert.NotNull(harvest);
        Assert.Equal("red", harvest.Result);
        Assert.Equal("Harvested. Your garden grew.", harvest.Closing);
        Assert.Equal("Spending ran above income", harvest.ResultLine);
    }

    [Fact]
    public void Build_MonthWithNothingNew_DoesNotClaimTheGardenGrew()
    {
        // Act: a second red month after Honest Harvest was already awarded
        var harvest = HarvestAssembler.Build([], [September(result: "red")], 3);

        // Assert
        Assert.NotNull(harvest);
        Assert.Empty(harvest.Items);
        Assert.Equal("Harvested.", harvest.Closing);
    }

    [Theory]
    [InlineData("green", 4, 5, "Spending stayed under income in the accounts you uploaded")]
    [InlineData("red", 4, 5, "Spending ran above income in the accounts you uploaded")]
    [InlineData("green", 5, 5, "Spending stayed under income")]
    [InlineData("neutral", 4, 5, "No income was recorded this month")]
    [InlineData("green", 0, 0, "Spending stayed under income")]   // no accounts known: the basis line says so
    public void Build_PartialCoverage_QualifiesTheResultLine(string result, int covered, int total, string expected)
    {
        // Act
        var harvest = HarvestAssembler.Build([], [September(result, covered, total)], 3);

        // Assert
        Assert.Equal(expected, harvest!.ResultLine);
    }

    [Fact]
    public void Build_SeveralUnseenMonths_HeadlinesTheLatestOne()
    {
        // Arrange
        var august = new HarvestMonthRecord(new DateOnly(2026, 8, 1), 1m, 1m, "red", 1, 1);

        // Act
        var harvest = HarvestAssembler.Build([], [august, September()], 0);

        // Assert
        Assert.Equal("2026-09", harvest!.Month);
    }

    [Fact]
    public void Build_FirstRunBackfill_FoldsIntoOneSummaryCarryingEveryId()
    {
        // Arrange
        var unseen = new List<HarvestInputItem>
        {
            new(1, "l1.meet_your_money", "Meet your money", Ev(), true, DateTime.UtcNow),
            new(2, "l1.in_the_green", "In the green", Ev(), true, DateTime.UtcNow),
            new(3, "l2.map_your_debts", "Map your debts", Ev(), true, DateTime.UtcNow),
        };

        // Act
        var harvest = HarvestAssembler.Build(unseen, [], 3);

        // Assert
        Assert.NotNull(harvest);
        var card = Assert.Single(harvest.Items);
        Assert.True(card.IsBackfill);
        Assert.Equal(3, card.Count);
        Assert.Equal([1L, 2L, 3L], card.CompletionIds);
        Assert.Equal("You'd already completed 3 quests", card.Title);
    }

    [Fact]
    public void Build_CompletionsWithoutAMonth_UsesGardenTitleAndNoClosing()
    {
        // Arrange
        var unseen = new List<HarvestInputItem>
        {
            new(9, "l2.count_your_cushion", "Count your cushion", Ev(("months", 0.8)), false, DateTime.UtcNow),
        };

        // Act
        var harvest = HarvestAssembler.Build(unseen, [], 1);

        // Assert
        Assert.NotNull(harvest);
        Assert.Null(harvest.Month);
        Assert.Equal("New in your garden", harvest.Title);
        Assert.Null(harvest.Closing);
    }

    [Fact]
    public void Build_SameInstant_PlacesQuestsThenStarsThenLevelClearedLast()
    {
        // Arrange: one engine pass stores catalog order (boss before stars) with one timestamp
        var at = new DateTime(2026, 10, 3, 9, 0, 0);
        var unseen = new List<HarvestInputItem>
        {
            new(10, "l1.boss", "Foundations cleared", Ev(), false, at),
            new(11, "stars.spend_lt_income", "⭐ Spending under 95% of income", Ev(), false, at),
            new(12, "l1.in_the_green", "In the green", Ev(), false, at),
        };

        // Act
        var harvest = HarvestAssembler.Build(unseen, [], 3);

        // Assert
        Assert.NotNull(harvest);
        Assert.Equal(["l1.in_the_green", "stars.spend_lt_income", "l1.boss"], harvest.Items.Select(i => i.Code).ToArray());
        Assert.Equal("Every Foundations indicator has cleared its bar.", harvest.Items[2].Line);
    }

    [Fact]
    public void IsBackfillEvidence_FlagTrue_ReturnsTrue()
    {
        Assert.True(HarvestAssembler.IsBackfillEvidence(Ev(("backfill", true))));
    }

    [Theory]
    [InlineData(false)]
    [InlineData("true")]
    [InlineData(null)]
    public void IsBackfillEvidence_AnythingButBooleanTrue_ReturnsFalse(object? flag)
    {
        Assert.False(HarvestAssembler.IsBackfillEvidence(Ev(("backfill", flag))));
        Assert.False(HarvestAssembler.IsBackfillEvidence(Ev()));
    }
}
