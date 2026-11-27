using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Tests.Support;
using Supabase.Postgrest.Exceptions;
using static PersonalFinance.Tests.Cashflow.CashflowRows;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// SpendingAnalysisService reads DateTime.Today, so fixtures are placed relative to the current
/// month (CM) and the three complete months before it (M1, M2, M3). Expected values come from
/// PF-108's formula: safe-to-spend = (income_baseline − committed_bills_remaining − savings_goal −
/// already_spent) / days_remaining, with income baseline the average of the 3 complete months.
/// "Spent" follows scoring-rubric.md "Spending vs saving": money moved to saving or investing is
/// not spending (Mutual Fund is in CashflowSectionMapping's Investing section).
/// </summary>
public sealed class SpendingAnalysisServiceTests
{
    private static readonly DateTime Today = DateTime.Today;
    private static readonly DateTime CurrentMonth = new(Today.Year, Today.Month, 1);
    private static DateTime M(int monthsBack) => CurrentMonth.AddMonths(-monthsBack).AddDays(9); // the 10th
    private static readonly int DaysRemaining = DateTime.DaysInMonth(Today.Year, Today.Month) - Today.Day + 1;

    private static async Task<(FakePostgrest Fake, SpendingAnalysisService Service)> StartAsync()
    {
        var fake = await FakePostgrest.StartAsync();
        var client = await fake.CreateClientAsync();
        return (fake, new SpendingAnalysisService(client, NullLogger<SpendingAnalysisService>.Instance, new TestCaller()));
    }

    /// <summary>
    /// <code>
    /// month  type     category      description           amount_idr
    /// CM     Expense  Food          WARUNG C                 250,000
    /// M1     Income   Salary        PAYROLL                9,000,000
    /// M1     Expense  Subscription  NETFLIX.COM 8821         186,000
    /// M1     Expense  Mutual Fund   BIBIT RD SAHAM         1,000,000
    /// M1     Expense  Food          WARUNG A                 600,000
    /// M2     Income   Salary        PAYROLL                9,000,000
    /// M2     Expense  Subscription  NETFLIX.COM 7710         186,000
    /// M2     Expense  Mutual Fund   BIBIT RD PASAR UANG    1,000,000
    /// M2     Expense  Food          WARUNG B                 400,000
    /// M3     Income   Salary        PAYROLL               12,000,000
    /// M3     Expense  Mutual Fund   BIBIT RD OBLIGASI      1,500,000
    /// M3     Expense  Food          WARUNG D                 500,000
    /// </code>
    /// Income baseline (9,000,000 + 9,000,000 + 12,000,000) / 3 = 10,000,000. Committed: only Netflix
    /// recurs (M1 and M2, digits ignored) and is not yet charged this month: 186,000. Savings goal:
    /// median of the monthly Mutual Fund outflow {1,000,000; 1,000,000; 1,500,000} = 1,000,000.
    /// Spent this month: 250,000. Numerator 10,000,000 − 186,000 − 1,000,000 − 250,000 = 8,564,000.
    /// </summary>
    private static List<object> BaseFixture() =>
    [
        Tx(1, CurrentMonth, "Expense", "Food", 250_000m, "WARUNG C"),
        Tx(2, M(1), "Income", "Salary", 9_000_000m, "PAYROLL"),
        Tx(3, M(1), "Expense", "Subscription", 186_000m, "NETFLIX.COM 8821"),
        Tx(4, M(1), "Expense", "Mutual Fund", 1_000_000m, "BIBIT RD SAHAM"),
        Tx(5, M(1), "Expense", "Food", 600_000m, "WARUNG A"),
        Tx(6, M(2), "Income", "Salary", 9_000_000m, "PAYROLL"),
        Tx(7, M(2), "Expense", "Subscription", 186_000m, "NETFLIX.COM 7710"),
        Tx(8, M(2), "Expense", "Mutual Fund", 1_000_000m, "BIBIT RD PASAR UANG"),
        Tx(9, M(2), "Expense", "Food", 400_000m, "WARUNG B"),
        Tx(10, M(3), "Income", "Salary", 12_000_000m, "PAYROLL"),
        Tx(11, M(3), "Expense", "Mutual Fund", 1_500_000m, "BIBIT RD OBLIGASI"),
        Tx(12, M(3), "Expense", "Food", 500_000m, "WARUNG D"),
    ];

    // ── GetSafeToSpendAsync ───────────────────────────────────────────────────

    [Fact]
    public async Task GetSafeToSpendAsync_BaseFixture_MatchesHandTotals()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(BaseFixture()));

        // Act
        var dto = await service.GetSafeToSpendAsync();

        // Assert
        Assert.Equal(10_000_000m, dto.IncomeBaseline);
        Assert.Equal(186_000m, dto.CommittedBillsRemaining);
        Assert.Equal(1_000_000m, dto.SavingsGoal);
        Assert.Equal(250_000m, dto.AlreadySpent);
        Assert.Equal(DaysRemaining, dto.DaysRemaining);
        Assert.Equal(Math.Round(8_564_000m / DaysRemaining, 0), dto.Amount);
        Assert.Equal("ok", dto.Status);

        var request = Assert.Single(fake.Requests);
        var query = Query(request);
        Assert.Contains($"user_id=eq.{TestCaller.Id}", query);
        Assert.Contains($"date=gte.{CurrentMonth.AddMonths(-3):yyyy-MM-dd}T00:00:00", query);
        Assert.Contains($"date=lte.{Today:yyyy-MM-dd}T00:00:00", query);
        Assert.Equal("0-999", request.Headers["Range"]);
    }

    [Fact]
    public async Task GetSafeToSpendAsync_InvestmentAlreadyMadeThisMonth_IsNotAlsoCountedAsSpent()
    {
        // Arrange: this month's 1,000,000 Mutual Fund purchase is the savings goal being met.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        var rows = BaseFixture();
        rows.Add(Tx(13, CurrentMonth, "Expense", "Mutual Fund", 1_000_000m, "BIBIT RD SAHAM"));
        fake.On("GET", "transactions", Json(rows));

        // Act
        var dto = await service.GetSafeToSpendAsync();

        // Assert: the savings goal already subtracts 1,000,000; counting the purchase as spent too
        // would subtract it twice. Spent stays 250,000; the numerator stays 8,564,000.
        Assert.Equal(250_000m, dto.AlreadySpent);
        Assert.Equal(Math.Round(8_564_000m / DaysRemaining, 0), dto.Amount);
    }

    [Fact]
    public async Task GetSafeToSpendAsync_RecurringInvestment_CountsAsSavingsGoalNotCommittedBill()
    {
        // Arrange: the same "BIBIT REKSADANA" debit every month, not yet made this month.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(
            Tx(2, M(1), "Income", "Salary", 9_000_000m, "PAYROLL"),
            Tx(3, M(1), "Expense", "Subscription", 186_000m, "NETFLIX.COM 8821"),
            Tx(4, M(1), "Expense", "Mutual Fund", 1_000_000m, "BIBIT REKSADANA"),
            Tx(6, M(2), "Income", "Salary", 9_000_000m, "PAYROLL"),
            Tx(7, M(2), "Expense", "Subscription", 186_000m, "NETFLIX.COM 7710"),
            Tx(8, M(2), "Expense", "Mutual Fund", 1_000_000m, "BIBIT REKSADANA"),
            Tx(10, M(3), "Income", "Salary", 12_000_000m, "PAYROLL"),
            Tx(11, M(3), "Expense", "Mutual Fund", 1_500_000m, "BIBIT REKSADANA")));

        // Act
        var dto = await service.GetSafeToSpendAsync();

        // Assert: the investment is set aside once, as the savings goal (median 1,000,000). The only
        // committed bill is Netflix, 186,000.
        Assert.Equal(1_000_000m, dto.SavingsGoal);
        Assert.Equal(186_000m, dto.CommittedBillsRemaining);
    }

    [Fact]
    public async Task GetSafeToSpendAsync_SpendingFarAboveIncome_IsDanger()
    {
        // Arrange: no income history, 50,000,000 spent this month.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(Tx(1, CurrentMonth, "Expense", "Shopping", 50_000_000m, "CAR DOWN PAYMENT")));

        // Act
        var dto = await service.GetSafeToSpendAsync();

        // Assert: −50,000,000 / days remaining is at least −1,612,903 a day.
        Assert.Equal(Math.Round(-50_000_000m / DaysRemaining, 0), dto.Amount);
        Assert.Equal("danger", dto.Status);
    }

    [Fact]
    public async Task GetSafeToSpendAsync_NoTransactions_ReturnsZeroAndNotOk()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]");

        // Act
        var dto = await service.GetSafeToSpendAsync();

        // Assert
        Assert.Equal((0m, 0m, 0m, 0m, 0m), (dto.Amount, dto.IncomeBaseline, dto.CommittedBillsRemaining, dto.SavingsGoal, dto.AlreadySpent));
        Assert.NotEqual("ok", dto.Status);
    }

    [Fact]
    public async Task GetSafeToSpendAsync_Account_FiltersByAccount()
    {
        // Arrange
        var account = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]");

        // Act
        await service.GetSafeToSpendAsync(account);

        // Assert
        Assert.Contains($"account_id=eq.{account}", Query(Assert.Single(fake.Requests)));
    }

    [Fact]
    public async Task GetSafeToSpendAsync_FullPage_FetchesNextPage()
    {
        // Arrange: 1,000 expense rows of 1,000 on page one and one of 500 on page two, this month.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        var page1 = Enumerable.Range(1, 1000).Select(i => Tx(i, CurrentMonth, "Expense", "Food", 1_000m, $"ROW {i}"));
        var page2 = new[] { Tx(1001, CurrentMonth, "Expense", "Food", 500m, "LAST") };
        fake.On("GET", "transactions", r => new FakeResponse(r.Headers["Range"] == "0-999" ? Json(page1) : Json(page2)));

        // Act
        var dto = await service.GetSafeToSpendAsync();

        // Assert: 1,000 × 1,000 + 500
        Assert.Equal(1_000_500m, dto.AlreadySpent);
        Assert.Equal(["0-999", "1000-1999"], fake.Requests.Select(r => r.Headers["Range"]));
    }

    [Fact]
    public async Task GetSafeToSpendAsync_PostgrestError_ThrowsSdkException()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", ServerError, 500);

        // Act + Assert
        await Assert.ThrowsAsync<PostgrestException>(() => service.GetSafeToSpendAsync());
    }

    // ── GetVarianceExplainerAsync ─────────────────────────────────────────────

    /// <summary>
    /// <code>
    /// month  category      amount_idr
    /// CM     Food             250,000
    /// CM     Shopping         800,000   (IKEA, never bought before)
    /// M1     Subscription     186,000
    /// M1     Food             600,000
    /// M2     Subscription     186,000
    /// M2     Food             400,000
    /// M3     Food             500,000
    /// </code>
    /// Plus a salary each trailing month (income, ignored). This month 1,050,000; trailing months
    /// 786,000, 586,000, 500,000, average 624,000; delta 426,000 = 68.3%. Drivers by |delta|:
    /// Shopping +800,000 (one-off, no trailing month), Food 250,000 − 500,000 = −250,000,
    /// Subscription 0 − 124,000 = −124,000 (2 of 3 months, not one-off).
    /// </summary>
    private static List<object> VarianceFixture() =>
    [
        Tx(1, CurrentMonth, "Expense", "Food", 250_000m, "WARUNG C"),
        Tx(2, CurrentMonth, "Expense", "Shopping", 800_000m, "IKEA"),
        Tx(3, M(1), "Income", "Salary", 9_000_000m, "PAYROLL"),
        Tx(4, M(1), "Expense", "Subscription", 186_000m, "NETFLIX"),
        Tx(5, M(1), "Expense", "Food", 600_000m, "WARUNG A"),
        Tx(6, M(2), "Income", "Salary", 9_000_000m, "PAYROLL"),
        Tx(7, M(2), "Expense", "Subscription", 186_000m, "NETFLIX"),
        Tx(8, M(2), "Expense", "Food", 400_000m, "WARUNG B"),
        Tx(9, M(3), "Income", "Salary", 12_000_000m, "PAYROLL"),
        Tx(10, M(3), "Expense", "Food", 500_000m, "WARUNG D"),
    ];

    private static readonly List<VarianceDriverDto> ExpectedDrivers =
    [
        new("Shopping", 800_000m, 0m, 800_000m, true),
        new("Food", 250_000m, 500_000m, -250_000m, false),
        new("Subscription", 0m, 124_000m, -124_000m, false),
    ];

    [Fact]
    public async Task GetVarianceExplainerAsync_Fixture_MatchesHandTotalsAndRanksDrivers()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(VarianceFixture()));

        // Act
        var dto = await service.GetVarianceExplainerAsync();

        // Assert
        Assert.Equal(1_050_000m, dto.CurrentMonthTotal);
        Assert.Equal(624_000m, dto.TrailingAvgTotal);
        Assert.Equal(426_000m, dto.Delta);
        Assert.Equal(68.3m, dto.DeltaPct); // 426,000 / 624,000 × 100 = 68.27
        Assert.Equal(ExpectedDrivers, dto.Drivers);
    }

    [Fact]
    public async Task GetVarianceExplainerAsync_InvestmentPurchases_AreNotSpendingDrivers()
    {
        // Arrange: the same fixture plus Mutual Fund purchases every month.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        var rows = VarianceFixture();
        rows.Add(Tx(11, CurrentMonth, "Expense", "Mutual Fund", 1_000_000m, "BIBIT"));
        rows.Add(Tx(12, M(1), "Expense", "Mutual Fund", 1_000_000m, "BIBIT"));
        rows.Add(Tx(13, M(2), "Expense", "Mutual Fund", 1_000_000m, "BIBIT"));
        rows.Add(Tx(14, M(3), "Expense", "Mutual Fund", 1_500_000m, "BIBIT"));
        fake.On("GET", "transactions", Json(rows));

        // Act
        var dto = await service.GetVarianceExplainerAsync();

        // Assert: money moved to investing is not spending, so every figure is unchanged.
        Assert.Equal(1_050_000m, dto.CurrentMonthTotal);
        Assert.Equal(624_000m, dto.TrailingAvgTotal);
        Assert.Equal(ExpectedDrivers, dto.Drivers);
    }

    [Fact]
    public async Task GetVarianceExplainerAsync_NoTransactions_ReturnsZeros()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]");

        // Act
        var dto = await service.GetVarianceExplainerAsync();

        // Assert
        Assert.Equal((0m, 0m, 0m, 0m), (dto.CurrentMonthTotal, dto.TrailingAvgTotal, dto.Delta, dto.DeltaPct));
        Assert.Empty(dto.Drivers);
    }

    [Fact]
    public async Task GetVarianceExplainerAsync_PostgrestError_ThrowsSdkException()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", ServerError, 500);

        // Act + Assert
        await Assert.ThrowsAsync<PostgrestException>(() => service.GetVarianceExplainerAsync());
    }
}
