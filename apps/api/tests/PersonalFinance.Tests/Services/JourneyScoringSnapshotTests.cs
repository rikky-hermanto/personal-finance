using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Quests;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Services;

/// <summary>
/// STEP 7: the four scoring indicators as pure functions of a ScoringSnapshot. The service is built
/// with null client + null confirmation service because the compute methods never touch them — they
/// read only the snapshot. "Today" is pinned to 2026-10-15, so the three months back are Sep/Aug/Jul.
/// </summary>
public class JourneyScoringSnapshotTests
{
    private static readonly DateOnly Today = new(2026, 10, 15);  // months back: Sep, Aug, Jul 2026
    private static readonly int[] ThreeMonths = [9, 8, 7];

    private static JourneyScoringService Service() =>
        new(null!, null!, NullLogger<JourneyScoringService>.Instance, TimeProvider.System);

    private static Transaction Tx(string type, string category, decimal amount, int month) =>
        new() { Type = type, Category = category, AmountIdr = amount, Date = new DateTime(2026, month, 15) };

    private static List<Transaction> EachMonth(string type, string category, decimal amount) =>
        ThreeMonths.Select(m => Tx(type, category, amount, m)).ToList();

    private static ScoringSnapshot Snap(
        IReadOnlyList<Transaction>? txs = null,
        IReadOnlyList<SavingsAccountFact>? savings = null,
        IReadOnlyList<Liability>? liabilities = null,
        DateTime? confirmedAt = null,
        bool confirmationLoaded = true) =>
        new(Today, txs, savings, liabilities, confirmedAt, confirmationLoaded, Array.Empty<IndicatorScoreDto>());

    // ─── spend_lt_income ─────────────────────────────────────────────────────────

    [Fact]
    public void ComputeSpendLtIncome_ThreeFullMonths_AveragesTheMonthlyRatios()
    {
        // Sep 0.9, Aug 0.8, Jul 1.0 → average ratio 0.9
        var txs = new List<Transaction>
        {
            Tx("Income", "Salary", 10_000_000m, 9), Tx("Expense", "Food", 9_000_000m, 9),
            Tx("Income", "Salary", 10_000_000m, 8), Tx("Expense", "Food", 8_000_000m, 8),
            Tx("Income", "Salary", 10_000_000m, 7), Tx("Expense", "Food", 10_000_000m, 7),
        };

        var result = Service().ComputeSpendLtIncome(Snap(txs));

        Assert.Equal(0.9m, result.RawValue);
        Assert.Equal(Math.Round(JourneyScoringService.ScoreSpendRatio(0.9m), 1), result.Score);
        Assert.NotEqual("no_data", result.Status);
    }

    [Fact]
    public void ComputeSpendLtIncome_InvestingOutflow_IsNotSpending()
    {
        // PF-151's example: income 10 jt, consumption 8 jt, investing 1.5 jt → ratio 0.80, score 100
        var txs = new List<Transaction>
        {
            Tx("Income", "Salary", 10_000_000m, 9),
            Tx("Expense", "Food", 8_000_000m, 9),
            Tx("Expense", "Investment", 1_500_000m, 9),
        };

        var result = Service().ComputeSpendLtIncome(Snap(txs));

        Assert.Equal(0.80m, result.RawValue);
        Assert.Equal(100m, result.Score);
    }

    [Fact]
    public void ComputeSpendLtIncome_TransactionsLoadFailed_ReturnsNoDataComputationError()
    {
        var result = Service().ComputeSpendLtIncome(Snap(txs: null));

        Assert.Equal("no_data", result.Status);
        Assert.Equal("Computation error", result.Description);
    }

    // ─── liquid_savings_ratio ──────────────────────────────────────────────────

    [Fact]
    public void ComputeLiquidSavings_UsesLatestValuationPerAccount()
    {
        // Two savings accounts, 20 jt + 10 jt = 30 jt. Consumption 10 jt/month → coverage 3.0 → 100.
        var savings = new List<SavingsAccountFact>
        {
            new(Guid.NewGuid(), "BCA", 20_000_000m, new DateTime(2026, 10, 1)),
            new(Guid.NewGuid(), "Jago", 10_000_000m, new DateTime(2026, 10, 1)),
        };
        var txs = EachMonth("Expense", "Food", 10_000_000m);

        var result = Service().ComputeLiquidSavings(Snap(txs, savings: savings));

        Assert.Equal(3.0m, result.RawValue);
        Assert.Equal(100m, result.Score);
    }

    [Fact]
    public void ComputeLiquidSavings_NoSavingsAccounts_ReturnsNoData()
    {
        var result = Service().ComputeLiquidSavings(
            Snap(EachMonth("Expense", "Food", 1_000_000m), savings: Array.Empty<SavingsAccountFact>()));

        Assert.Equal("no_data", result.Status);
        Assert.Equal("No savings accounts found", result.Description);
    }

    [Fact]
    public void ComputeLiquidSavings_LoadFailed_ReturnsNoDataComputationError()
    {
        var result = Service().ComputeLiquidSavings(Snap(EachMonth("Expense", "Food", 1_000_000m), savings: null));

        Assert.Equal("no_data", result.Status);
        Assert.Equal("Computation error", result.Description);
    }

    // ─── manageable_dti ──────────────────────────────────────────────────────────

    [Fact]
    public void ComputeDti_NoLiabilitiesNoConfirmation_ReturnsNoData()
    {
        var result = Service().ComputeDti(
            Snap(EachMonth("Income", "Salary", 10_000_000m), liabilities: Array.Empty<Liability>()));

        Assert.Equal("no_data", result.Status);
    }

    [Fact]
    public void ComputeDti_NoLiabilitiesConfirmed_ScoresZeroDti()
    {
        var result = Service().ComputeDti(Snap(
            EachMonth("Income", "Salary", 10_000_000m),
            liabilities: Array.Empty<Liability>(),
            confirmedAt: new DateTime(2026, 10, 1)));

        Assert.Equal(0m, result.RawValue);
        Assert.Equal(100m, result.Score);
    }

    [Fact]
    public void ComputeDti_LiabilityOverridesConfirmation()
    {
        // Debt service 2 jt against income 10 jt → DTI 0.2, even though "no debts" is confirmed.
        var liabilities = new List<Liability> { new() { Name = "Card", MonthlyPayment = 2_000_000m } };

        var result = Service().ComputeDti(Snap(
            EachMonth("Income", "Salary", 10_000_000m),
            liabilities: liabilities,
            confirmedAt: new DateTime(2026, 10, 1)));

        Assert.Equal(0.2m, result.RawValue);
        Assert.Equal(100m, result.Score);
    }

    [Fact]
    public void ComputeDti_ConfirmationReadFailed_FailsClosedAsNoData()
    {
        var result = Service().ComputeDti(Snap(
            EachMonth("Income", "Salary", 10_000_000m),
            liabilities: Array.Empty<Liability>(),
            confirmationLoaded: false));

        Assert.Equal("no_data", result.Status);
        Assert.Equal("Computation error", result.Description);
    }

    // ─── savings_rate ──────────────────────────────────────────────────────────

    [Fact]
    public void ComputeSavingsRate_CountsOnlySavingsOutflows()
    {
        // Income 10 jt, Investment 1 jt (counts), Food 3 jt (excluded) each month → rate 0.1.
        var txs = new List<Transaction>();
        txs.AddRange(EachMonth("Income", "Salary", 10_000_000m));
        txs.AddRange(EachMonth("Expense", "Investment", 1_000_000m));
        txs.AddRange(EachMonth("Expense", "Food", 3_000_000m));

        var result = Service().ComputeSavingsRate(Snap(txs));

        Assert.Equal(0.1m, result.RawValue);
        Assert.Equal(75m, result.Score);
    }
}
