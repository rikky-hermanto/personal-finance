using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Services;

public class NetWorthCalculatorTests
{
    private static readonly Guid Bca = Guid.NewGuid();
    private static readonly Guid Broker = Guid.NewGuid();
    private static readonly Guid Land = Guid.NewGuid();
    private static readonly Guid Stock = Guid.NewGuid();

    private static readonly List<Account> Accounts =
    [
        new() { Id = Bca, AccountType = "savings", IsActive = true, OpeningDate = Utc(2026, 1, 1) },
        new() { Id = Broker, AccountType = "brokerage", IsActive = true, OpeningDate = Utc(2026, 1, 1) },
    ];

    private static readonly List<Asset> Assets = [new() { Id = Land, AssetClass = "real_estate" }];
    private static readonly List<Holding> Holdings = [new() { Id = Stock, AccountId = Broker }];
    private static readonly List<Liability> Liabilities = [new() { Principal = 30_000_000m }];

    // ── Summarize ───────────────────────────────────────────────────────────

    [Fact]
    public void Summarize_WithHoldings_CountsHoldingsAsLiquidAssets()
    {
        // Arrange
        var valuations = new[]
        {
            Val("account", Bca, 5_000_000m, Utc(2026, 4, 30)),
            Val("account", Broker, 1_000_000m, Utc(2026, 4, 30)),
            Val("asset", Land, 74_000_000m, Utc(2026, 4, 30)),
            Val("holding", Stock, 45_000_000m, Utc(2026, 4, 30)),
        };

        // Act
        var result = NetWorthCalculator.Summarize(Accounts, Assets, Holdings, Liabilities, valuations);

        // Assert
        Assert.Equal(125_000_000m, result.AssetsIdr);
        Assert.Equal(30_000_000m, result.LiabilitiesIdr);
        Assert.Equal(95_000_000m, result.NetWorthIdr);
        Assert.Equal(51_000_000m, result.LiquidIdr); // land is not liquid
    }

    [Fact]
    public void Summarize_SubjectWithSeveralValuations_UsesTheLatest()
    {
        // Arrange
        var valuations = new[]
        {
            Val("account", Bca, 9_000_000m, Utc(2026, 5, 31)),
            Val("account", Bca, 5_000_000m, Utc(2026, 4, 30)),
        };

        // Act
        var result = NetWorthCalculator.Summarize(Accounts.Take(1).ToList(), [], [], [], valuations);

        // Assert
        Assert.Equal(9_000_000m, result.AssetsIdr);
    }

    [Fact]
    public void Summarize_AccountWithoutValuation_UsesOpeningBalance_AndSkipsInactive()
    {
        // Arrange
        var accounts = new List<Account>
        {
            new() { Id = Guid.NewGuid(), AccountType = "checking", IsActive = true, OpeningBalance = 2_000_000m },
            new() { Id = Guid.NewGuid(), AccountType = "checking", IsActive = false, OpeningBalance = 7_000_000m },
        };

        // Act
        var result = NetWorthCalculator.Summarize(accounts, [], [], [], []);

        // Assert
        Assert.Equal(2_000_000m, result.AssetsIdr);
    }

    [Fact]
    public void Summarize_CreditCardAccount_IsAnAssetButNotLiquid()
    {
        // Arrange
        var card = new Account { Id = Guid.NewGuid(), AccountType = "credit_card", IsActive = true };
        var valuations = new[] { Val("account", card.Id, 1_000_000m, Utc(2026, 4, 30)) };

        // Act
        var result = NetWorthCalculator.Summarize([card], [], [], [], valuations);

        // Assert
        Assert.Equal(1_000_000m, result.AssetsIdr);
        Assert.Equal(0m, result.LiquidIdr);
    }

    // ── History ─────────────────────────────────────────────────────────────

    [Fact]
    public void History_CheckInOfOneAccount_CarriesOtherValuesForward()
    {
        // Arrange — everything valued on 30 Apr, then only BCA checked in on 15 May.
        var valuations = new[]
        {
            Val("account", Bca, 5_000_000m, Utc(2026, 4, 30)),
            Val("account", Broker, 1_000_000m, Utc(2026, 4, 30)),
            Val("asset", Land, 74_000_000m, Utc(2026, 4, 30)),
            Val("holding", Stock, 45_000_000m, Utc(2026, 4, 30)),
            Val("account", Bca, 6_000_000m, Utc(2026, 5, 15)),
        };

        // Act
        var points = NetWorthCalculator.History(Accounts, Assets, Holdings, Liabilities, valuations,
            Utc(2026, 1, 1), Utc(2026, 12, 31));

        // Assert
        Assert.Equal(2, points.Count);
        Assert.Equal(95_000_000m, points[0].ValueIdr);
        Assert.Equal(96_000_000m, points[1].ValueIdr);
        Assert.Equal(126_000_000m, points[1].AssetsIdr);
        Assert.Equal(30_000_000m, points[1].LiabilitiesIdr);
    }

    [Fact]
    public void History_ValuationsBeforeFrom_SeedTheFirstPointButAreNotReturned()
    {
        // Arrange
        var valuations = new[]
        {
            Val("asset", Land, 74_000_000m, Utc(2025, 6, 30)),
            Val("account", Bca, 5_000_000m, Utc(2026, 4, 30)),
        };

        // Act
        var points = NetWorthCalculator.History(Accounts.Take(1).ToList(), Assets, [], [], valuations,
            Utc(2026, 1, 1), Utc(2026, 12, 31));

        // Assert
        var point = Assert.Single(points);
        Assert.Equal(Utc(2026, 4, 30), point.Date);
        Assert.Equal(79_000_000m, point.ValueIdr);
    }

    [Fact]
    public void History_AccountOpenedLater_IsLeftOutOfEarlierPoints()
    {
        // Arrange
        var late = new Account { Id = Guid.NewGuid(), AccountType = "savings", IsActive = true,
            OpeningBalance = 3_000_000m, OpeningDate = Utc(2026, 6, 1) };
        var valuations = new[] { Val("asset", Land, 74_000_000m, Utc(2026, 4, 30)) };

        // Act
        var points = NetWorthCalculator.History([late], Assets, [], [], valuations,
            Utc(2026, 1, 1), Utc(2026, 12, 31));

        // Assert
        Assert.Equal(74_000_000m, Assert.Single(points).AssetsIdr);
    }

    [Fact]
    public void History_ValuationsAfterTo_AreIgnored()
    {
        // Arrange
        var valuations = new[]
        {
            Val("asset", Land, 74_000_000m, Utc(2026, 4, 30)),
            Val("asset", Land, 80_000_000m, Utc(2026, 8, 31)),
        };

        // Act
        var points = NetWorthCalculator.History([], Assets, [], [], valuations,
            Utc(2026, 1, 1), Utc(2026, 6, 30));

        // Assert
        Assert.Equal(74_000_000m, Assert.Single(points).ValueIdr);
    }

    private static Valuation Val(string type, Guid id, decimal valueIdr, DateTime at) =>
        new() { Id = Guid.NewGuid(), SubjectType = type, SubjectId = id, ValueIdr = valueIdr, ValuedAt = at };

    private static DateTime Utc(int y, int m, int d) => new(y, m, d, 0, 0, 0, DateTimeKind.Utc);
}
