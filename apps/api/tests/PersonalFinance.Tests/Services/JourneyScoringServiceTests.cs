using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;
using Xunit;

namespace PersonalFinance.Tests.Services;

/// <summary>
/// Tests for JourneyScoringService scoring formulas via reflection of the private static methods.
/// These tests validate the rubric math (specs/scoring-rubric.md) — boundary conditions matter most.
/// </summary>
public class JourneyScoringServiceTests
{
    // ─── Spend < Income (spend_lt_income) ──────────────────────────────────────

    [Fact]
    public void ScoreSpendRatio_WhenSpendEqualsIncome_ReturnsZero()
    {
        var score = InvokeScoreSpendRatio(1.00m);
        Assert.Equal(0m, score);
    }

    [Fact]
    public void ScoreSpendRatio_WhenSpendExceedsIncome_ReturnsZero()
    {
        var score = InvokeScoreSpendRatio(1.20m);
        Assert.Equal(0m, score);
    }

    [Fact]
    public void ScoreSpendRatio_WhenSpendIs95Percent_Returns50()
    {
        var score = InvokeScoreSpendRatio(0.95m);
        Assert.Equal(50m, Math.Round(score, 1));
    }

    [Fact]
    public void ScoreSpendRatio_WhenSpendIs80Percent_Returns100()
    {
        var score = InvokeScoreSpendRatio(0.80m);
        Assert.Equal(100m, score);
    }

    [Fact]
    public void ScoreSpendRatio_WhenSpendBelow80Percent_Returns100()
    {
        var score = InvokeScoreSpendRatio(0.60m);
        Assert.Equal(100m, score);
    }

    [Fact]
    public void ScoreSpendRatio_WhenSpendIs875Percent_Returns75()
    {
        // Midpoint between 95% (score=50) and 80% (score=100) = 87.5% → score=75
        var score = InvokeScoreSpendRatio(0.875m);
        Assert.Equal(75m, Math.Round(score, 1));
    }

    // ─── Liquid Savings Ratio (liquid_savings_ratio) ───────────────────────────

    [Fact]
    public void ScoreLiquidSavings_AtHalfMonth_ReturnsZero()
    {
        var score = InvokeScoreLiquidSavings(0.5m);
        Assert.Equal(0m, score);
    }

    [Fact]
    public void ScoreLiquidSavings_BelowHalfMonth_ReturnsZero()
    {
        var score = InvokeScoreLiquidSavings(0.2m);
        Assert.Equal(0m, score);
    }

    [Fact]
    public void ScoreLiquidSavings_At15Months_Returns50()
    {
        var score = InvokeScoreLiquidSavings(1.5m);
        Assert.Equal(50m, Math.Round(score, 1));
    }

    [Fact]
    public void ScoreLiquidSavings_AtThreeMonths_Returns100()
    {
        var score = InvokeScoreLiquidSavings(3.0m);
        Assert.Equal(100m, score);
    }

    [Fact]
    public void ScoreLiquidSavings_AboveThreeMonths_Returns100()
    {
        var score = InvokeScoreLiquidSavings(5.0m);
        Assert.Equal(100m, score);
    }

    [Fact]
    public void ScoreLiquidSavings_At225Months_Returns75()
    {
        // Midpoint between 1.5 (score=50) and 3.0 (score=100) = 2.25 → score=75
        var score = InvokeScoreLiquidSavings(2.25m);
        Assert.Equal(75m, Math.Round(score, 1));
    }

    // ─── DTI Score (manageable_dti) ────────────────────────────────────────────

    [Fact]
    public void ScoreDti_At50Percent_ReturnsZero()
    {
        var score = InvokeScoreDti(0.50m);
        Assert.Equal(0m, score);
    }

    [Fact]
    public void ScoreDti_Above50Percent_ReturnsZero()
    {
        var score = InvokeScoreDti(0.70m);
        Assert.Equal(0m, score);
    }

    [Fact]
    public void ScoreDti_At36Percent_Returns50()
    {
        var score = InvokeScoreDti(0.36m);
        Assert.Equal(50m, Math.Round(score, 1));
    }

    [Fact]
    public void ScoreDti_At20Percent_Returns100()
    {
        var score = InvokeScoreDti(0.20m);
        Assert.Equal(100m, score);
    }

    [Fact]
    public void ScoreDti_At0Percent_Returns100()
    {
        var score = InvokeScoreDti(0m);
        Assert.Equal(100m, score);
    }

    [Fact]
    public void ScoreDti_At28Percent_Returns75()
    {
        // Midpoint between 36% (score=50) and 20% (score=100) = 28% → score=75
        var score = InvokeScoreDti(0.28m);
        Assert.Equal(75m, Math.Round(score, 1));
    }

    // ─── Savings Rate (savings_rate) ───────────────────────────────────────────

    [Fact]
    public void ScoreSavingsRate_AtZero_ReturnsZero()
    {
        var score = InvokeScoreSavingsRate(0m);
        Assert.Equal(0m, score);
    }

    [Fact]
    public void ScoreSavingsRate_At5Percent_Returns50()
    {
        var score = InvokeScoreSavingsRate(0.05m);
        Assert.Equal(50m, Math.Round(score, 1));
    }

    [Fact]
    public void ScoreSavingsRate_At15Percent_Returns100()
    {
        var score = InvokeScoreSavingsRate(0.15m);
        Assert.Equal(100m, score);
    }

    [Fact]
    public void ScoreSavingsRate_Above15Percent_Returns100()
    {
        var score = InvokeScoreSavingsRate(0.30m);
        Assert.Equal(100m, score);
    }

    [Fact]
    public void ScoreSavingsRate_At10Percent_Returns75()
    {
        // Midpoint between 5% (score=50) and 15% (score=100) = 10% → score=75
        var score = InvokeScoreSavingsRate(0.10m);
        Assert.Equal(75m, Math.Round(score, 1));
    }

    // ─── Level Graduation Logic ─────────────────────────────────────────────────

    [Fact]
    public void DetermineCurrentLevel_WhenAllL1Above70_GraduatesToL1()
    {
        var indicators = new List<IndicatorScoreDto>
        {
            new("spend_lt_income", "L1", 75m, null, "achieved", "Spend less than income", ""),
            new("pay_bills_on_time", "L1", 0m, null, "no_data", "Pay bills", ""),
            new("liquid_savings_ratio", "L2", 40m, null, "in_progress", "Liquid savings", ""),
        };
        var levelScores = new Dictionary<string, decimal> { ["L1"] = 75m, ["L2"] = 40m };

        var level = InvokeDetermineCurrentLevel(levelScores, indicators);
        Assert.Equal(1, level);
    }

    [Fact]
    public void DetermineCurrentLevel_WhenL1AndL2AllAbove70_GraduatesToL2()
    {
        var indicators = new List<IndicatorScoreDto>
        {
            new("spend_lt_income", "L1", 80m, null, "achieved", "Spend less than income", ""),
            new("pay_bills_on_time", "L1", 0m, null, "no_data", "Pay bills", ""),
            new("liquid_savings_ratio", "L2", 75m, null, "achieved", "Liquid savings", ""),
            new("manageable_dti", "L2", 85m, null, "achieved", "DTI", ""),
        };
        var levelScores = new Dictionary<string, decimal> { ["L1"] = 80m, ["L2"] = 80m };

        var level = InvokeDetermineCurrentLevel(levelScores, indicators);
        Assert.Equal(2, level);
    }

    [Fact]
    public void DetermineCurrentLevel_WhenL1BelowThreshold_StaysAt1()
    {
        var indicators = new List<IndicatorScoreDto>
        {
            new("spend_lt_income", "L1", 50m, null, "in_progress", "Spend less than income", ""),
        };
        var levelScores = new Dictionary<string, decimal> { ["L1"] = 50m };

        var level = InvokeDetermineCurrentLevel(levelScores, indicators);
        Assert.Equal(1, level);
    }

    // ─── Reflection Helpers ────────────────────────────────────────────────────

    private static decimal InvokeScoreSpendRatio(decimal ratio)
        => InvokePrivate<decimal>("ScoreSpendRatio", ratio);

    private static decimal InvokeScoreLiquidSavings(decimal months)
        => InvokePrivate<decimal>("ScoreLiquidSavings", months);

    private static decimal InvokeScoreDti(decimal dti)
        => InvokePrivate<decimal>("ScoreDti", dti);

    private static decimal InvokeScoreSavingsRate(decimal rate)
        => InvokePrivate<decimal>("ScoreSavingsRate", rate);

    private static int InvokeDetermineCurrentLevel(
        Dictionary<string, decimal> levelScores,
        List<IndicatorScoreDto> indicators)
    {
        var method = typeof(JourneyScoringService)
            .GetMethod("DetermineCurrentLevel",
                System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)
            ?? throw new InvalidOperationException("Method not found");

        return (int)method.Invoke(null, new object[] { levelScores, indicators })!;
    }

    private static T InvokePrivate<T>(string methodName, decimal arg)
    {
        var method = typeof(JourneyScoringService)
            .GetMethod(methodName,
                System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)
            ?? throw new InvalidOperationException($"Method {methodName} not found");

        return (T)method.Invoke(null, new object[] { arg })!;
    }
}
