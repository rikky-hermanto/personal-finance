using PersonalFinance.Application.Constants;
using PersonalFinance.Application.Dtos.Desk;
using Xunit;

namespace PersonalFinance.Tests.Desk;

public class DeskPresetTests
{
    private static JournalStatsDto Stats(int closed, decimal complianceRate) =>
        new(
            Closed: closed,
            WinRate: 0m,
            AvgWinR: 0m,
            AvgLossR: 0m,
            ExpectancyR: 0m,
            ProfitFactor: null,
            ComplianceRate: complianceRate,
            ConsecutiveLosses: 0,
            CompliantCount: 0);

    [Fact]
    public void BuildPresets_Always_ReturnsLearningAndStandardOnly()
    {
        // Arrange / Act
        var presets = DeskDefaults.BuildPresets(Stats(0, 0m));

        // Assert — deliberately no "Aggressive" tier; see the CIO note in DeskDefaults.
        Assert.Equal(2, presets.Count);
        Assert.Collection(presets,
            p => Assert.Equal(DeskDefaults.LearningPresetKey, p.Key),
            p => Assert.Equal(DeskDefaults.StandardPresetKey, p.Key));
    }

    [Fact]
    public void BuildPresets_NoTrackRecord_LearningUnlockedStandardLocked()
    {
        // Arrange / Act
        var presets = DeskDefaults.BuildPresets(Stats(0, 0m));

        // Assert
        var learning = presets[0];
        var standard = presets[1];
        Assert.False(learning.Locked);
        Assert.Null(learning.UnlockRequirement);
        Assert.True(standard.Locked);
        Assert.NotNull(standard.UnlockRequirement);
    }

    [Theory]
    [InlineData(19, 1.00, true)]  // enough compliance, not enough trades
    [InlineData(20, 0.89, true)]  // enough trades, compliance just short
    [InlineData(20, 0.90, false)] // exactly at both thresholds — unlocks
    [InlineData(50, 0.95, false)]
    public void BuildPresets_StandardLock_TracksBothUnlockThresholds(int closed, double compliance, bool expectedLocked)
    {
        // Arrange / Act
        var presets = DeskDefaults.BuildPresets(Stats(closed, (decimal)compliance));

        // Assert
        Assert.Equal(expectedLocked, presets[1].Locked);
    }

    [Fact]
    public void LearningParams_ComparedToStandard_IsStrictlyTighterOnEveryRiskLimit()
    {
        // Arrange
        var learning = DeskDefaults.LearningParams;
        var standard = DeskDefaults.StandardParams;

        // Assert — a "safer" tier that is looser on any dimension is a trap, not a tier.
        Assert.True(learning.RiskPerTradePct < standard.RiskPerTradePct);
        Assert.True(learning.HardCeilingPct < standard.HardCeilingPct);
        Assert.True(learning.DailyLossLimitPct < standard.DailyLossLimitPct);
        Assert.True(learning.WeeklyLossLimitPct < standard.WeeklyLossLimitPct);
        Assert.True(learning.MonthlyLossLimitPct < standard.MonthlyLossLimitPct);
        Assert.True(learning.HardHeatPct < standard.HardHeatPct);
        Assert.True(learning.MaxSingleStockPct < standard.MaxSingleStockPct);
        Assert.True(learning.ConsecutiveLossStop < standard.ConsecutiveLossStop);
        Assert.Equal(standard.MinRR, learning.MinRR); // 2R floor holds at every tier
    }

    [Fact]
    public void AllPresets_Always_DisableLeverageAndAveragingDown()
    {
        // Arrange / Act
        var presets = DeskDefaults.BuildPresets(Stats(100, 1.00m));

        // Assert
        Assert.All(presets, p =>
        {
            Assert.False(p.Params.LeverageEnabled);
            Assert.False(p.Params.AveragingDownEnabled);
        });
    }

    [Fact]
    public void StandardParams_Always_MatchesShippedMandateDefault()
    {
        // Assert — Standard must stay a rename of MandateDefault, never a second set of numbers.
        Assert.Equal(
            DeskDefaults.MandateDefault with { Preset = "Standard" },
            DeskDefaults.StandardParams);
    }
}
