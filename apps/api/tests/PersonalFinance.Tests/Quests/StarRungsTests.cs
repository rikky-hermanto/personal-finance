using PersonalFinance.Application.Quests;
using PersonalFinance.Application.Services;
using Xunit;

namespace PersonalFinance.Tests.Quests;

/// <summary>
/// STEP 9: stars are derived from the same rubric breakpoints as the scores. The invariant test
/// (RawAtRung_ScoresExactlyTheRungScore) makes "every star is exactly true" a CI fact: if a Score*
/// formula or a StarRungs threshold drifts, this fails.
/// </summary>
public class StarRungsTests
{
    [Theory]
    [InlineData(49, 0)]
    [InlineData(50, 1)]
    [InlineData(69, 1)]
    [InlineData(70, 2)]
    [InlineData(99, 2)]
    [InlineData(100, 3)]
    public void StarsFor_BoundaryScores(decimal score, int expectedStars) =>
        Assert.Equal(expectedStars, StarRungs.StarsFor("spend_lt_income", score, "achieved"));

    [Fact]
    public void StarsFor_NoData_ReturnsZero() =>
        Assert.Equal(0, StarRungs.StarsFor("spend_lt_income", 100m, "no_data"));

    [Fact]
    public void StarsFor_UnknownCode_ReturnsZero() =>
        Assert.Equal(0, StarRungs.StarsFor("pay_bills_on_time", 100m, "achieved"));

    [Fact]
    public void RawAtRung_ScoresExactlyTheRungScore_ForEveryIndicator()
    {
        foreach (var indicator in StarRungs.Indicators)
        {
            for (var k = 0; k < StarRungs.Scores.Count; k++)
            {
                var raw = indicator.RawAtRung[k];
                var expected = StarRungs.Scores[k];
                var actual = indicator.Code switch
                {
                    "spend_lt_income" => JourneyScoringService.ScoreSpendRatio(raw),
                    "liquid_savings_ratio" => JourneyScoringService.ScoreLiquidSavings(raw),
                    "manageable_dti" => JourneyScoringService.ScoreDti(raw),
                    "savings_rate" => JourneyScoringService.ScoreSavingsRate(raw),
                    _ => throw new Xunit.Sdk.XunitException($"No score formula mapped for {indicator.Code}"),
                };
                Assert.True(Math.Abs(actual - expected) <= 0.05m,
                    $"{indicator.Code} rung {k}: raw {raw} scored {actual}, expected ~{expected}");
            }
        }
    }

    [Fact]
    public void RungCopy_RendersEveryRungFromTheRawValues()
    {
        Assert.Equal("Spending under 89% of income", StarRungs.RungCopy("spend_lt_income", 2));
        Assert.Equal("2.1 months of expenses saved", StarRungs.RungCopy("liquid_savings_ratio", 2));
        Assert.Equal("Debt payments under 29.6% of income", StarRungs.RungCopy("manageable_dti", 2));
        Assert.Equal("Setting aside 9% of income", StarRungs.RungCopy("savings_rate", 2));
    }
}
