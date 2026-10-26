using PersonalFinance.Application.Quests;
using Xunit;

namespace PersonalFinance.Tests.Quests;

public class WorkingLevelTests
{
    private static IndicatorFact Ind(string code, string level, decimal score, string status = "in_progress") =>
        new(code, level, score, null, status);

    [Fact]
    public void WorkingLevel_L1BelowBar_IsL1()
    {
        var (working, cleared) = WorkingLevel.Compute([Ind("spend_lt_income", "L1", 69m)]);

        Assert.Equal("L1", working);
        Assert.Empty(cleared);
    }

    [Fact]
    public void WorkingLevel_L1Cleared_IsL2()
    {
        var (working, cleared) = WorkingLevel.Compute([Ind("spend_lt_income", "L1", 70m)]);

        Assert.Equal("L2", working);
        Assert.Contains("L1", cleared);
    }

    [Fact]
    public void WorkingLevel_LevelWithNoLiveIndicator_IsNotCleared()
    {
        var (working, cleared) = WorkingLevel.Compute([Ind("spend_lt_income", "L1", 0m, "no_data")]);

        Assert.Equal("L1", working);
        Assert.Empty(cleared);
    }

    [Fact]
    public void WorkingLevel_L1And2Cleared_IsL3()
    {
        var (working, cleared) = WorkingLevel.Compute([
            Ind("spend_lt_income", "L1", 100m),
            Ind("liquid_savings_ratio", "L2", 80m),
            Ind("manageable_dti", "L2", 0m, "no_data"),
        ]);

        Assert.Equal("L3", working);
        Assert.Equal(2, cleared.Count);
    }

    [Fact]
    public void WorkingLevel_UntrustedIndicator_DoesNotClearItsLevel()
    {
        var (working, _) = WorkingLevel.Compute([
            Ind("spend_lt_income", "L1", 100m),
            new IndicatorFact("liquid_savings_ratio", "L2", 90m, 2.5m, "achieved", Trusted: false),
        ]);

        Assert.Equal("L2", working);
    }
}
