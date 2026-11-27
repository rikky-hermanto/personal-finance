using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Application.Services;
using PersonalFinance.Tests.Support;
using Supabase.Postgrest.Exceptions;
using static PersonalFinance.Tests.Cashflow.CashflowRows;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// The detectors are unit-tested in Services/InsightServiceTests. These tests cover the public
/// entry points on the harness: the caller-scoped fetch, the account-name lookup the
/// statement-gap detector needs, ranking, the cap of 10, and the daily pulse. Fixtures avoid the
/// day-of-month-gated detectors (over and under budget) so the result does not depend on today.
/// </summary>
public sealed class InsightServiceOrchestrationTests
{
    private static readonly DateTime Today = DateTime.Today;
    private static readonly DateTime CurrentMonth = new(Today.Year, Today.Month, 1);
    private static DateTime M(int monthsBack) => CurrentMonth.AddMonths(-monthsBack).AddDays(9);
    private static readonly Guid Bca = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid OldWallet = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");

    private static async Task<(FakePostgrest Fake, InsightService Service)> StartAsync()
    {
        var fake = await FakePostgrest.StartAsync();
        var client = await fake.CreateClientAsync();
        return (fake, new InsightService(client, NullLogger<InsightService>.Instance, new TestCaller()));
    }

    [Fact]
    public async Task GetInsightsAsync_Fixture_RanksAlertThenStreakBreakThenInfo()
    {
        // Arrange
        // - "Old Wallet" last had data in M3 (over 35 days ago): statement gap, alert.
        // - Stocks in M1 and M2, none this month: investment habit break, streak_break.
        // - Medical averaged 90,000 a month; 500,000 this month is over 2x: large transaction, info.
        //   The 90,000 average is below the over-budget (100,000) and under-budget (200,000) floors.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(
            Tx(1, CurrentMonth, "Expense", "Medical", 500_000m, "RS SEHAT", accountId: Bca),
            Tx(2, M(1), "Expense", "Stocks", 1_000_000m, "AJAIB", accountId: Bca),
            Tx(3, M(2), "Expense", "Stocks", 1_000_000m, "AJAIB", accountId: Bca),
            Tx(4, M(1), "Expense", "Medical", 90_000m, "APOTEK", accountId: Bca),
            Tx(5, M(2), "Expense", "Medical", 90_000m, "APOTEK", accountId: Bca),
            Tx(6, M(3), "Expense", "Medical", 90_000m, "APOTEK", accountId: OldWallet)));
        fake.On("GET", "accounts", Json(Account(Bca, "BCA"), Account(OldWallet, "Old Wallet")));

        // Act
        var insights = await service.GetInsightsAsync();

        // Assert
        Assert.Equal(["statement_gap", "habit_break", "large_transaction"], insights.Select(i => i.Type));
        Assert.Equal(["alert", "streak_break", "info"], insights.Select(i => i.Severity));
        Assert.Equal("Old Wallet: statement not uploaded", insights[0].Title);
        Assert.Equal("habit_break-investment", insights[1].Id);
        Assert.Equal(2m, insights[1].MetricValue); // two prior months with an investment
        Assert.Equal("Medical", insights[2].Category);
        Assert.Equal(90_000m, insights[2].MetricValue); // Medical average (90,000 × 3) / 3, across accounts

        var query = Query(Assert.Single(fake.RequestsTo("GET", "transactions")));
        Assert.Contains($"user_id=eq.{TestCaller.Id}", query);
        Assert.Contains($"date=gte.{CurrentMonth.AddMonths(-3):yyyy-MM-dd}", query);
        Assert.Contains($"user_id=eq.{TestCaller.Id}", Query(Assert.Single(fake.RequestsTo("GET", "accounts"))));
    }

    [Fact]
    public async Task GetInsightsAsync_ManyAlerts_CapsAtTen()
    {
        // Arrange: twelve wallets whose last data is in M3.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        var ids = Enumerable.Range(1, 12).Select(i => Guid.Parse($"cccccccc-0000-0000-0000-{i:D12}")).ToList();
        fake.On("GET", "transactions", Json(ids.Select((id, i) => Tx(i + 1, M(3), "Expense", "Food", 10_000m, accountId: id))));
        fake.On("GET", "accounts", Json(ids.Select((id, i) => Account(id, $"Wallet {i + 1}"))));

        // Act
        var insights = await service.GetInsightsAsync();

        // Assert
        Assert.Equal(10, insights.Count);
        Assert.All(insights, i => Assert.Equal("statement_gap", i.Type));
    }

    [Fact]
    public async Task GetInsightsAsync_NoTransactions_ReturnsEmptyWithoutAccountLookup()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]");

        // Act
        var insights = await service.GetInsightsAsync();

        // Assert
        Assert.Empty(insights);
        Assert.Empty(fake.RequestsTo("GET", "accounts"));
    }

    [Fact]
    public async Task GetInsightsAsync_PostgrestError_ThrowsSdkException()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", ServerError, 500);

        // Act + Assert
        await Assert.ThrowsAsync<PostgrestException>(() => service.GetInsightsAsync());
    }

    // ── GetDailyPulseAsync ────────────────────────────────────────────────────

    private static readonly decimal MonthProgress = (decimal)Today.Day / DateTime.DaysInMonth(Today.Year, Today.Month);

    private static object[] Trailing900k() =>
    [
        Tx(11, M(1), "Expense", "Food", 900_000m),
        Tx(12, M(2), "Expense", "Food", 900_000m),
        Tx(13, M(3), "Expense", "Food", 900_000m),
    ];

    [Fact]
    public async Task GetDailyPulseAsync_NoHistory_ReturnsWelcomeWithoutRatio()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(Tx(1, CurrentMonth, "Expense", "Food", 50_000m)));

        // Act
        var pulse = await service.GetDailyPulseAsync();

        // Assert
        Assert.Equal("neutral", pulse.Tone);
        Assert.StartsWith("Welcome!", pulse.Headline);
        Assert.Null(pulse.PaceVsBaseline);
        Assert.Equal(MonthProgress, pulse.MonthProgress);
    }

    [Fact]
    public async Task GetDailyPulseAsync_NothingSpentYet_IsPositive()
    {
        // Arrange: trailing average 900,000 a month, nothing spent this month: pace ratio −1.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(Trailing900k()));

        // Act
        var pulse = await service.GetDailyPulseAsync();

        // Assert
        Assert.Equal("positive", pulse.Tone);
        Assert.Equal(-1.000m, pulse.PaceVsBaseline); // (0 − 900,000 × p) / (900,000 × p)
        Assert.Equal("Your spending this month is 100% below average — great job!", pulse.Headline);
    }

    [Fact]
    public async Task GetDailyPulseAsync_TwiceTheMonthlyAverageAlready_IsCaution()
    {
        // Arrange: 1,800,000 spent this month against a 900,000 monthly average. Whatever the day,
        // the pace ratio is 2 / p − 1 ≥ 1, above the 20% caution line.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        var rows = Trailing900k().Append(Tx(1, CurrentMonth, "Expense", "Shopping", 1_800_000m)).ToArray();
        fake.On("GET", "transactions", Json(rows));

        // Act
        var pulse = await service.GetDailyPulseAsync();

        // Assert
        Assert.Equal("caution", pulse.Tone);
        Assert.True(pulse.PaceVsBaseline >= 1m, $"pace ratio {pulse.PaceVsBaseline}");
        Assert.Contains("above your usual monthly average", pulse.Headline);
    }
}
