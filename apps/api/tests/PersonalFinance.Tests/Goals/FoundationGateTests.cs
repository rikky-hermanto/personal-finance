using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;

namespace PersonalFinance.Tests.Goals;

// Synthetic figures only. Bars come from the live scoring functions (formulas.md §9 "Foundation check").
public class FoundationGateTests
{
    private static IndicatorScoreDto Ind(string code, decimal score, decimal? raw) =>
        new(code, code == "spend_lt_income" ? "L1" : "L2", score, raw, score >= 70 ? "achieved" : "in_progress", code, code);

    private static IndicatorScoreDto NoData(string code) => new(code, "L2", 0m, null, "no_data", code, code);

    // Passing baseline: spending 70% of income, 3 months of cover, DTI 18%.
    private static FoundationInputs Passing() => new(
        Spend: Ind("spend_lt_income", 100m, 0.70m),
        Cover: Ind("liquid_savings_ratio", 100m, 3.0m),
        Dti: Ind("manageable_dti", 100m, 0.18m),
        SavingsFresh: true,
        LiquidTotal: 30_000_000m,
        AvgMonthlyConsumption: 10_000_000m,
        EarmarkedInSavings: 0m,
        AvgMonthlyIncome: 10_000_000m,
        MonthlyDebtService: 1_800_000m);

    [Fact]
    public void Evaluate_EveryInputPasses_Clear()
    {
        // Act
        var f = FoundationGate.Evaluate(Passing());

        // Assert
        Assert.Equal("clear", f.State);
        Assert.Empty(f.Failing);
        Assert.Empty(f.Missing);
        Assert.Equal(3.0m, f.CoverMonthsAfterEarmarks);
        Assert.Equal(0.18m, f.CurrentDti);
    }

    [Fact]
    public void Evaluate_SpendNoData_NotEvaluated()
    {
        // Act
        var f = FoundationGate.Evaluate(Passing() with { Spend = NoData("spend_lt_income") });

        // Assert
        Assert.Equal("not_evaluated", f.State);
        Assert.Contains("spend_lt_income", f.Missing);
    }

    [Fact]
    public void Evaluate_CoverPassesDtiNoData_NotEvaluatedNeverClear()
    {
        // Act
        var f = FoundationGate.Evaluate(Passing() with { Dti = NoData("manageable_dti") });

        // Assert
        Assert.Equal("not_evaluated", f.State);
        Assert.Contains("manageable_dti", f.Missing);
        Assert.Null(f.CurrentDti);
    }

    [Fact]
    public void Evaluate_StaleSavings_NotEvaluatedWithSavingsStale()
    {
        // Act
        var f = FoundationGate.Evaluate(Passing() with { SavingsFresh = false });

        // Assert
        Assert.Equal("not_evaluated", f.State);
        Assert.Contains("savings_stale", f.Missing);
        Assert.Null(f.CoverMonthsAfterEarmarks);
    }

    [Fact]
    public void Evaluate_EarmarksReduceCoverBelowBar_NotRecommendedYet()
    {
        // Arrange: 26M liquid is 2.6 months; 12M earmarked leaves 14M, 1.4 months
        var inputs = Passing() with
        {
            Cover = Ind("liquid_savings_ratio", 86.7m, 2.6m),
            LiquidTotal = 26_000_000m,
            EarmarkedInSavings = 12_000_000m,
        };

        // Act
        var f = FoundationGate.Evaluate(inputs);

        // Assert
        Assert.Equal("not_recommended_yet", f.State);
        Assert.Contains("cover_after_earmarks", f.Failing);
        Assert.Equal(1.4m, f.CoverMonthsAfterEarmarks);
        Assert.Equal(12_000_000m, f.EarmarkedInSavings);
    }

    [Fact]
    public void Evaluate_EarmarksAboveLiquidTotal_CoverZeroNotNegative()
    {
        // Act
        var f = FoundationGate.Evaluate(Passing() with { EarmarkedInSavings = 50_000_000m });

        // Assert
        Assert.Equal(0m, f.CoverMonthsAfterEarmarks);
        Assert.Contains("cover_after_earmarks", f.Failing);
    }

    [Fact]
    public void Evaluate_DtiFailsCoverMissing_NotRecommendedYet()
    {
        // Act: a known failure outranks a missing input
        var f = FoundationGate.Evaluate(Passing() with
        {
            Cover = NoData("liquid_savings_ratio"),
            Dti = Ind("manageable_dti", 40m, 0.40m),
        });

        // Assert
        Assert.Equal("not_recommended_yet", f.State);
        Assert.Contains("manageable_dti", f.Failing);
        Assert.Contains("liquid_savings_ratio", f.Missing);
    }

    [Fact]
    public void ForGoal_InstalmentPushesDtiAboveBar_NotRecommendedYet()
    {
        // Arrange: 1.8M + 1.6M on a 10M income takes DTI from 0.18 to 0.34
        var inputs = Passing();
        var f = FoundationGate.Evaluate(inputs);

        // Act
        var g = FoundationGate.ForGoal(f, inputs, 1_600_000m);

        // Assert
        Assert.Equal("not_recommended_yet", g.State);
        Assert.Contains("post_purchase_dti", g.Failing);
        Assert.Equal(0.34m, g.PostPurchaseDti);
    }

    [Fact]
    public void ForGoal_InstalmentWithDtiNoData_NotEvaluated()
    {
        // Arrange
        var inputs = Passing() with { Dti = NoData("manageable_dti") };
        var f = FoundationGate.Evaluate(inputs);

        // Act
        var g = FoundationGate.ForGoal(f, inputs, 1_000_000m);

        // Assert
        Assert.Equal("not_evaluated", g.State);
        Assert.Contains("post_purchase_dti", g.Missing);
        Assert.Null(g.PostPurchaseDti);
    }

    [Fact]
    public void ForGoal_InstalmentZero_NoPostPurchaseCheck()
    {
        // Arrange
        var inputs = Passing();
        var f = FoundationGate.Evaluate(inputs);

        // Act
        var g = FoundationGate.ForGoal(f, inputs, 0m);

        // Assert
        Assert.Equal("clear", g.State);
        Assert.Null(g.PostPurchaseDti);
        Assert.DoesNotContain("post_purchase_dti", g.Failing);
    }
}
