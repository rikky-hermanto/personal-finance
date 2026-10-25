using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Services;

public class JourneyScoringRulesTests
{
    private static readonly DateTime[] September = [new DateTime(2026, 9, 1)];

    private static Transaction Tx(string type, string category, decimal amount, int month = 9) =>
        new() { Type = type, Category = category, AmountIdr = amount, Date = new DateTime(2026, month, 15) };

    // ─── G3: investing is not spending ─────────────────────────────────────────

    [Fact]
    public void MonthlyConsumptionRatios_InvestingOnTopOfConsumption_RatioIs080AndScoreIs100()
    {
        // Arrange — the brief's example: income 10 jt, consumption 8 jt, investing 1.5 jt
        var txs = new List<Transaction>
        {
            Tx("Income", "Salary", 10_000_000m),
            Tx("Expense", "Food", 8_000_000m),
            Tx("Expense", "Investment", 1_500_000m),
        };

        // Act
        var ratios = JourneyScoringRules.MonthlyConsumptionRatios(txs, September);
        var score = JourneyScoringService.ScoreSpendRatio(ratios.Average());

        // Assert
        Assert.Equal(0.80m, Assert.Single(ratios));
        Assert.Equal(100m, score);
    }

    [Theory]
    [InlineData("Investment")]
    [InlineData("Savings Transfer")]
    [InlineData("Investasi")]
    [InlineData("Tabungan")]
    [InlineData("investment")]
    [InlineData("  INVESTASI ")]
    public void IsSavingsOutflow_ExpenseInSavingsCategory_IsTrueAndNotConsumption(string category)
    {
        var tx = Tx("Expense", category, 1m);

        Assert.True(JourneyScoringRules.IsSavingsOutflow(tx));
        Assert.False(JourneyScoringRules.IsConsumption(tx));
    }

    [Fact]
    public void IsConsumption_ExpenseInOrdinaryCategory_IsTrue()
    {
        Assert.True(JourneyScoringRules.IsConsumption(Tx("Expense", "Food", 1m)));
        Assert.False(JourneyScoringRules.IsSavingsOutflow(Tx("Expense", "Food", 1m)));
    }

    [Fact]
    public void MonthlyConsumptionRatios_DividendCredit_StaysIncomeAndLowersTheRatio()
    {
        // Arrange — dividend: Income typed, category Investment (the DIVIDEN preset)
        var txs = new List<Transaction>
        {
            Tx("Income", "Salary", 9_000_000m),
            Tx("Income", "Investment", 1_000_000m),
            Tx("Expense", "Food", 8_000_000m),
        };

        // Act
        var ratios = JourneyScoringRules.MonthlyConsumptionRatios(txs, September);

        // Assert — 8 jt / 10 jt: the dividend counts as income
        Assert.Equal(0.80m, Assert.Single(ratios));
    }

    [Fact]
    public void MonthlyConsumptionRatios_MonthWithoutIncome_IsSkipped()
    {
        var txs = new List<Transaction> { Tx("Expense", "Food", 5_000_000m) };

        var ratios = JourneyScoringRules.MonthlyConsumptionRatios(txs, September);

        Assert.Empty(ratios);
    }

    // ─── Q1: cover uses consumption ────────────────────────────────────────────

    [Fact]
    public void AverageMonthlyConsumption_InvestingOutflowPresent_ExcludesIt()
    {
        var txs = new List<Transaction>
        {
            Tx("Expense", "Food", 8_000_000m),
            Tx("Expense", "Investment", 1_500_000m),
        };

        var average = JourneyScoringRules.AverageMonthlyConsumption(txs, September);

        Assert.Equal(8_000_000m, average);
    }

    // ─── Q2: savings rate counts outflows only ─────────────────────────────────

    [Fact]
    public void AverageMonthlySavingsOutflow_DividendCredit_IsNotCountedAsContribution()
    {
        var txs = new List<Transaction>
        {
            Tx("Expense", "Investment", 1_500_000m),
            Tx("Income", "Investment", 400_000m),
        };

        var average = JourneyScoringRules.AverageMonthlySavingsOutflow(txs, September);

        Assert.Equal(1_500_000m, average);
    }

    [Fact]
    public void AverageMonthlyIncome_MonthsWithoutRows_CountAsZero()
    {
        // Pins the existing averaging convention (follow-up in Notes) so a change is deliberate.
        var txs = new List<Transaction> { Tx("Income", "Salary", 9_000_000m, month: 9) };
        DateTime[] threeMonths = [new(2026, 7, 1), new(2026, 8, 1), new(2026, 9, 1)];

        var average = JourneyScoringRules.AverageMonthlyIncome(txs, threeMonths);

        Assert.Equal(3_000_000m, average);
    }

    // ─── Savings-account casing fix (3b item 5) ────────────────────────────────

    [Fact]
    public void SavingsAccountType_MatchesTheLowercaseValueAllowedByTheCheckConstraint()
    {
        Assert.Equal("savings", JourneyScoringRules.SavingsAccountType);
    }

    [Fact]
    public void AccountValuationSubjectType_MatchesTheLowercaseValueAllowedByTheCheckConstraint()
    {
        Assert.Equal("account", JourneyScoringRules.AccountValuationSubjectType);
    }

    // ─── G4: DTI is not evaluated without debt data ────────────────────────────

    private static Liability Debt(decimal? monthlyPayment) => new() { Name = "Loan", MonthlyPayment = monthlyPayment };

    [Fact]
    public void EvaluateDti_NoLiabilitiesAndNoConfirmation_IsNotEvaluated()
    {
        var outcome = JourneyScoringRules.EvaluateDti([], noDebtsConfirmedAt: null, avgMonthlyIncome: 10_000_000m);

        Assert.Null(outcome.Dti);
        Assert.False(string.IsNullOrWhiteSpace(outcome.NotEvaluatedReason));
    }

    [Fact]
    public void EvaluateDti_NoLiabilitiesButConfirmed_IsZeroAndScores100()
    {
        var outcome = JourneyScoringRules.EvaluateDti([], new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc), 10_000_000m);

        Assert.Equal(0m, outcome.Dti);
        Assert.Equal(100m, JourneyScoringService.ScoreDti(outcome.Dti!.Value));
    }

    [Fact]
    public void EvaluateDti_LiabilityRecordedWithoutConfirmation_ComputesFromTheLiability()
    {
        var outcome = JourneyScoringRules.EvaluateDti([Debt(3_000_000m)], null, 10_000_000m);

        Assert.Equal(0.30m, outcome.Dti);
    }

    [Fact]
    public void EvaluateDti_LiabilityAddedAfterConfirmation_LiabilityOverridesConfirmation()
    {
        var confirmed = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);

        var outcome = JourneyScoringRules.EvaluateDti([Debt(3_000_000m)], confirmed, 10_000_000m);

        Assert.Equal(0.30m, outcome.Dti);
    }

    [Fact]
    public void EvaluateDti_NoIncome_IsNotEvaluated()
    {
        var outcome = JourneyScoringRules.EvaluateDti([Debt(3_000_000m)], null, 0m);

        Assert.Null(outcome.Dti);
    }

    [Fact]
    public void EvaluateDti_LiabilityWithoutMonthlyPayment_IsNotEvaluatedAndNamesTheLiability()
    {
        // Arrange — the owner's real case: one credit card, payment unknown
        var card = new Liability { Name = "Kartu Kredit BCA", MonthlyPayment = null };

        // Act
        var outcome = JourneyScoringRules.EvaluateDti([card], null, 10_000_000m);

        // Assert — unknown is never zero, so it can never score 100
        Assert.Null(outcome.Dti);
        Assert.Contains("Kartu Kredit BCA", outcome.NotEvaluatedReason);
    }

    [Fact]
    public void EvaluateDti_OneOfTwoLiabilitiesWithoutPayment_IsNotEvaluated()
    {
        var outcome = JourneyScoringRules.EvaluateDti([Debt(3_000_000m), Debt(null)], null, 10_000_000m);

        Assert.Null(outcome.Dti);
    }

    [Fact]
    public void EvaluateDti_ConfirmedButLiabilityWithoutPayment_IsNotEvaluated()
    {
        var confirmed = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);

        var outcome = JourneyScoringRules.EvaluateDti([Debt(null)], confirmed, 10_000_000m);

        Assert.Null(outcome.Dti);
    }

    [Fact]
    public void EvaluateDti_PaymentEnteredAsZero_CountsAsKnown()
    {
        var outcome = JourneyScoringRules.EvaluateDti([Debt(0m)], null, 10_000_000m);

        Assert.Equal(0m, outcome.Dti);
    }

    // ─── Achievements and graduation ───────────────────────────────────────────

    private static IndicatorScoreDto Ind(string code, string level, decimal score, string status) =>
        new(code, level, score, null, status, code, "");

    [Fact]
    public void AchievementsEarned_DtiNotEvaluated_DoesNotUnlockDebtFree()
    {
        var indicators = new List<IndicatorScoreDto> { Ind("manageable_dti", "L2", 0m, "no_data") };

        var earned = JourneyScoringRules.AchievementsEarned(indicators);

        Assert.DoesNotContain("debt_free", earned);
    }

    [Fact]
    public void AchievementsEarned_DtiEvaluatedAt100_UnlocksDebtFree()
    {
        var indicators = new List<IndicatorScoreDto> { Ind("manageable_dti", "L2", 100m, "achieved") };

        var earned = JourneyScoringRules.AchievementsEarned(indicators);

        Assert.Contains("debt_free", earned);
    }

    [Fact]
    public void AchievementsEarned_L2HasOnlyAnUnevaluatedIndicator_DoesNotGraduateL2()
    {
        var indicators = new List<IndicatorScoreDto>
        {
            Ind("spend_lt_income", "L1", 90m, "achieved"),
            Ind("manageable_dti", "L2", 0m, "no_data"),
        };

        var earned = JourneyScoringRules.AchievementsEarned(indicators);

        Assert.Contains("graduated_l1", earned);
        Assert.DoesNotContain("graduated_l2", earned);
    }

    [Fact]
    public void AchievementsEarned_L2LiveIndicatorsAllAtLeast70_GraduatesL2()
    {
        var indicators = new List<IndicatorScoreDto>
        {
            Ind("liquid_savings_ratio", "L2", 75m, "achieved"),
            Ind("manageable_dti", "L2", 0m, "no_data"),
        };

        var earned = JourneyScoringRules.AchievementsEarned(indicators);

        Assert.Contains("graduated_l2", earned);
    }
}
