using PersonalFinance.Application.Services.Buckets;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Buckets;

public class BucketCalculatorTests
{
    private static Transaction Tx(DateTime date, string description, decimal amount, string type = "Expense", string category = "Food", string account = "BCA") =>
        new()
        {
            Date = date,
            Description = description,
            Type = type,
            Category = category,
            AmountIdr = amount,
            AccountName = account,
        };

    // ── Median ──────────────────────────────────────────────────────────────

    [Fact]
    public void Median_OddCount_ReturnsMiddleValue()
    {
        var result = BucketCalculator.Median([1_000_000m, 5_000_000m, 2_000_000m]);
        Assert.Equal(2_000_000m, result);
    }

    [Fact]
    public void Median_EvenCount_ReturnsAverageOfMiddleTwo()
    {
        var result = BucketCalculator.Median([1_000_000m, 2_000_000m, 3_000_000m, 4_000_000m]);
        Assert.Equal(2_500_000m, result);
    }

    [Fact]
    public void DeriveMonthlyMedians_OneOutlierMonth_MedianIgnoresTheSpike()
    {
        // One Ramadan month (Food spikes to 10M) must not set the year's Free budget — median, not mean.
        var may = new DateTime(2026, 5, 15);
        var jun = new DateTime(2026, 6, 15); // the outlier month
        var jul = new DateTime(2026, 7, 15);
        var trailingMonths = new List<DateTime> { may, jun, jul };

        var trailingTxs = new List<Transaction>
        {
            Tx(may, "groceries", 3_000_000m),
            Tx(jun, "groceries", 10_000_000m), // Ramadan spike
            Tx(jul, "groceries", 3_200_000m),
        };

        var (_, _, free, _) = BucketCalculator.DeriveMonthlyMedians(trailingTxs, trailingMonths, committedKeys: []);

        Assert.Equal(3_200_000m, free);
        Assert.NotEqual(Math.Round(trailingTxs.Average(t => t.AmountIdr), 0), free);
    }

    // ── DetectCommittedItems ────────────────────────────────────────────────

    [Fact]
    public void DetectCommittedItems_RecurringLowVarianceItem_IsCertain()
    {
        var trailingMonths = new List<DateTime> { new(2026, 5, 1), new(2026, 6, 1), new(2026, 7, 1) };
        var trailingTxs = new List<Transaction>
        {
            Tx(new DateTime(2026, 5, 2), "Room rent", 1_800_000m, category: "Bill"),
            Tx(new DateTime(2026, 6, 2), "Room rent", 1_800_000m, category: "Bill"),
            Tx(new DateTime(2026, 7, 2), "Room rent", 1_800_000m, category: "Bill"),
        };

        var items = BucketCalculator.DetectCommittedItems(trailingTxs, [], trailingMonths, demotedKeys: []);

        var rent = Assert.Single(items);
        Assert.True(rent.Certain);
        Assert.Null(rent.Note);
    }

    [Fact]
    public void DetectCommittedItems_RecurringHighVarianceItem_IsFlaggedWatch()
    {
        var trailingMonths = new List<DateTime> { new(2026, 5, 1), new(2026, 6, 1), new(2026, 7, 1) };
        var trailingTxs = new List<Transaction>
        {
            Tx(new DateTime(2026, 5, 15), "Electricity", 250_000m, category: "Bill"),
            Tx(new DateTime(2026, 6, 15), "Electricity", 310_000m, category: "Bill"),
            Tx(new DateTime(2026, 7, 15), "Electricity", 400_000m, category: "Bill"),
        };

        var items = BucketCalculator.DetectCommittedItems(trailingTxs, [], trailingMonths, demotedKeys: []);

        var electricity = Assert.Single(items);
        Assert.False(electricity.Certain);
        Assert.NotNull(electricity.Note);
    }

    [Fact]
    public void DetectCommittedItems_DemotedKey_IsExcluded()
    {
        var trailingMonths = new List<DateTime> { new(2026, 5, 1), new(2026, 6, 1), new(2026, 7, 1) };
        var trailingTxs = new List<Transaction>
        {
            Tx(new DateTime(2026, 5, 2), "Room rent", 1_800_000m, category: "Bill"),
            Tx(new DateTime(2026, 6, 2), "Room rent", 1_800_000m, category: "Bill"),
            Tx(new DateTime(2026, 7, 2), "Room rent", 1_800_000m, category: "Bill"),
        };

        var items = BucketCalculator.DetectCommittedItems(trailingTxs, [], trailingMonths, demotedKeys: ["room rent"]);

        Assert.Empty(items);
    }

    // ── Allocate (waterfall) ────────────────────────────────────────────────

    [Fact]
    public void Allocate_SufficientFunds_AllTiersFullyFundedNoStop()
    {
        var result = BucketCalculator.Allocate(arrived: 8_000_000m, committed: 4_200_000m, future: 700_000m, freeBudget: 3_100_000m, freeLabel: "Free");

        Assert.Null(result.StoppedAtTier);
        Assert.Equal(0m, result.ShortBy);
        Assert.All(result.Tiers, t => Assert.Equal(0m, t.Short));
    }

    [Fact]
    public void Allocate_Shortfall_StopsAtOneNamedTier_NeverProRata()
    {
        // Committed (4.2M) + Future (0.7M) fully covered by 6.15M arrived; Free receives only the
        // 1.25M remainder against its 3.1M want. The shortfall must land entirely on Free, never
        // spread proportionally across all three tiers.
        var result = BucketCalculator.Allocate(arrived: 6_150_000m, committed: 4_200_000m, future: 700_000m, freeBudget: 3_100_000m, freeLabel: "Free");

        Assert.Equal("Free", result.StoppedAtTier);
        Assert.Equal(1_850_000m, result.ShortBy);

        var committedTier = result.Tiers.Single(t => t.Kind == "committed");
        var futureTier = result.Tiers.Single(t => t.Kind == "future");
        var freeTier = result.Tiers.Single(t => t.Kind == "free");

        Assert.Equal(0m, committedTier.Short);
        Assert.Equal(0m, futureTier.Short);
        Assert.Equal(1_850_000m, freeTier.Short);
        Assert.Equal(1_250_000m, freeTier.Got);
    }

    [Fact]
    public void Allocate_SevereShortfall_StopsAtCommittedBeforeFundingFutureOrFree()
    {
        var result = BucketCalculator.Allocate(arrived: 2_000_000m, committed: 4_200_000m, future: 700_000m, freeBudget: 3_100_000m, freeLabel: "Free");

        Assert.Equal("Committed", result.StoppedAtTier);
        var futureTier = result.Tiers.Single(t => t.Kind == "future");
        var freeTier = result.Tiers.Single(t => t.Kind == "free");
        Assert.Equal(0m, futureTier.Got);
        Assert.Equal(0m, freeTier.Got);
    }

    // ── SumLiquid ───────────────────────────────────────────────────────────

    [Fact]
    public void SumLiquid_AcrossMultipleAccounts_EqualsSumOfEachAccount()
    {
        // The emergency-fund denominator must not shrink just because liquidity is split across banks.
        var balances = new List<decimal> { 2_000_000m, 1_500_000m, 2_400_000m };

        var total = BucketCalculator.SumLiquid(balances);

        Assert.Equal(balances.Sum(), total);
        Assert.Equal(5_900_000m, total);
    }
}
