using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Dtos.Buckets;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services.Buckets;
using PersonalFinance.Tests.Cashflow;
using PersonalFinance.Tests.Support;

namespace PersonalFinance.Tests.Journey;

/// <summary>
/// The I/O and orchestration in BucketsService. The median, detection and waterfall math is
/// covered in Buckets/BucketCalculatorTests.cs. The fake does not apply filters, so these tests
/// assert the filters the service sends.
/// </summary>
public sealed class BucketsServiceTests
{
    /// <summary>Every read GetBucketsAsync makes: no accounts, overrides or saved settings.</summary>
    private static async Task<FakePostgrest> StartFakeAsync(string transactions = "[]")
    {
        var fake = await FakePostgrest.StartAsync();
        return fake
            .On("GET", "transactions", transactions)
            .On("GET", "accounts", "[]")
            .On("GET", "bucket_category_overrides", "[]")
            .On("GET", "bucket_settings", "[]");
    }

    private static Mock<ICashflowMutationService> CreateMutations()
    {
        var mutations = new Mock<ICashflowMutationService>();
        mutations.Setup(m => m.GetLiquidTotalAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0m);
        mutations.Setup(m => m.SetFuturePlanAsync(It.IsAny<decimal>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask)
            .Verifiable();
        mutations.Setup(m => m.DemoteCommittedItemAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask)
            .Verifiable();
        return mutations;
    }

    private static async Task<BucketsService> CreateServiceAsync(
        FakePostgrest fake, Mock<ICashflowMutationService> mutations) =>
        new(await fake.CreateClientAsync(), NullLogger<BucketsService>.Instance, new TestCaller(), mutations.Object);

    // The service reads the real clock, so the rows are dated relative to today. The 10th keeps each
    // row in its month whatever the host's time zone.
    private static string ThreeTrailingMonthsOfRent()
    {
        var currentMonthStart = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        return CashflowRows.Json(Enumerable.Range(1, 3).Select(i => CashflowRows.Tx(
            i, currentMonthStart.AddMonths(-i).AddDays(9), "Expense", "Bill", 1_800_000m,
            description: "Room rent")));
    }

    // ─── Month-close fixture ────────────────────────────────────────────────────
    // monthsBack 1 is the month being closed; 2 to 4 are its three-month baseline.
    //
    // Row               | 4 back     | 3 back     | 2 back     | closing (1 back)
    // Salary (income)   | 10,000,000 | 10,000,000 | 10,000,000 | 10,000,000
    // Room rent (Bill)  |  1,800,000 |  1,800,000 |  1,800,000 |  1,800,000
    // Investment        |  1,000,000 |  1,000,000 |  1,000,000 |  1,000,000 (5th) + 500,000 (20th)
    // Food              |  4,000,000 |  2,000,000 |  3,000,000 |  7,500,000
    // Shopping          |    500,000 |    500,000 |    500,000 |    700,000
    //
    // Baseline medians: income 10,000,000; committed 1,800,000; invested 1,000,000; Food 3,000,000.
    // Free budget: 10,000,000 - 1,800,000 - 1,000,000 = 7,200,000.
    // Free spent:  7,500,000 + 700,000 = 8,200,000, so over by 1,000,000.
    // Invested in the closing month: 1,000,000 + 500,000 = 1,500,000.
    // Biggest driver: Food is 4,500,000 above usual; Shopping 200,000; rent 0.

    private static readonly Guid SourceAccountId = Guid.Parse("88888888-8888-8888-8888-888888888888");

    private static DateTime Day(int monthsBack, int day) =>
        new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1).AddMonths(-monthsBack).AddDays(day - 1);

    private static DateTime LastDay(int monthsBack) => Day(monthsBack - 1, 1).AddDays(-1);

    private static List<object> CloseRows(
        decimal closingFood = 7_500_000m, decimal closingRent = 1_800_000m, int[]? rentMonthsBack = null)
    {
        var rows = new List<object>();
        var id = 100;
        void Add(DateTime day, string type, string category, decimal amount, string description) =>
            rows.Add(CashflowRows.Tx(
                id++, day, type, category, amount, description, accountId: SourceAccountId));

        var food = new Dictionary<int, decimal>
        {
            [4] = 4_000_000m, [3] = 2_000_000m, [2] = 3_000_000m, [1] = closingFood,
        };
        foreach (var back in new[] { 4, 3, 2, 1 })
        {
            Add(Day(back, 1), "Income", "Salary", 10_000_000m, "Salary");
            if ((rentMonthsBack ?? [4, 3, 2, 1]).Contains(back))
                Add(Day(back, 3), "Expense", "Bill", back == 1 ? closingRent : 1_800_000m, "Room rent");
            Add(Day(back, 5), "Expense", "Investment", 1_000_000m, "Reksa dana");
            Add(Day(back, 10), "Expense", "Food", food[back], "Groceries");
            Add(Day(back, 12), "Expense", "Shopping", back == 1 ? 700_000m : 500_000m, "Tokopedia");
        }
        Add(Day(1, 20), "Expense", "Investment", 500_000m, "Reksa dana");
        return rows;
    }

    private static async Task<MonthCloseDto> CloseMonthAsync(
        IEnumerable<object> rows, decimal? savedPlan = null)
    {
        await using var fake = await StartFakeAsync(CashflowRows.Json(rows));
        if (savedPlan is not null)
            fake.On("GET", "bucket_settings", CashflowRows.Json(new
            {
                id = Guid.NewGuid(), user_id = TestCaller.Id, future_monthly_amount = savedPlan,
            }));
        fake.On("GET", "accounts",
            CashflowRows.Json(CashflowRows.Account(SourceAccountId, "BCA Tahapan")));
        var service = await CreateServiceAsync(fake, CreateMutations());
        return await service.GetMonthCloseAsync();
    }

    [Fact]
    public async Task GetMonthCloseAsync_FourMonthFixture_ReturnsHandComputedFigures()
    {
        // Act
        var close = await CloseMonthAsync(CloseRows());

        // Assert: see the fixture table above.
        Assert.Equal(Day(1, 1).ToString("MMMM", CultureInfo.InvariantCulture), close.MonthLabel);
        Assert.Equal(1_000_000m, close.FuturePlanned);
        Assert.Equal(1_500_000m, close.FutureActual);
        Assert.Equal(7_200_000m, close.FreeBudget);
        Assert.Equal(8_200_000m, close.FreeSpent);
        Assert.Equal(1_000_000m, close.FreeOverBy);
        Assert.True(close.AllCommittedPaid);
        Assert.Equal(4, close.CommittedStreakMonths);
        Assert.Equal("Food", close.BiggestDriverCategory);
        Assert.Equal(7_500_000m, close.BiggestDriverAmount);
        Assert.Equal(3_000_000m, close.BiggestDriverUsual);
        Assert.Equal(1_000_000m, close.SuggestedNextFuture);
        // Oldest transfer first.
        Assert.Equal(new[] { 1_000_000m, 500_000m }, close.Transfers.Select(t => t.Amount));
        Assert.Equal(
            new[] { 5, 20 }.Select(d => Day(1, d).ToString("MMM d", CultureInfo.InvariantCulture)),
            close.Transfers.Select(t => t.Date));
        Assert.All(close.Transfers, t => Assert.Equal("Investment", t.To));
    }

    [Fact]
    public async Task GetMonthCloseAsync_SavedPlanAboveUsual_UsesThePlanAndSuggestsIt()
    {
        // Act
        var close = await CloseMonthAsync(CloseRows(), savedPlan: 2_000_000m);

        // Assert: 10,000,000 - 1,800,000 - 2,000,000 = 6,200,000; 8,200,000 spent is 2,000,000 over.
        Assert.Equal(2_000_000m, close.FuturePlanned);
        Assert.Equal(6_200_000m, close.FreeBudget);
        Assert.Equal(2_000_000m, close.FreeOverBy);
        Assert.Equal(2_000_000m, close.SuggestedNextFuture);
    }

    [Fact]
    public async Task GetMonthCloseAsync_WithinBudgetAndLowPlan_ReportsNoOverspendAndSuggestsUsual()
    {
        // Act
        var close = await CloseMonthAsync(CloseRows(closingFood: 3_000_000m), savedPlan: 400_000m);

        // Assert: 3,700,000 spent against 7,800,000. The suggestion rises to the usual 1,000,000.
        Assert.Equal(7_800_000m, close.FreeBudget);
        Assert.Equal(3_700_000m, close.FreeSpent);
        Assert.Equal(0m, close.FreeOverBy);
        Assert.Equal(1_000_000m, close.SuggestedNextFuture);
    }

    [Fact]
    public async Task GetMonthCloseAsync_RentMissedInClosingMonth_BreaksTheStreak()
    {
        // Act
        var close = await CloseMonthAsync(CloseRows(rentMonthsBack: [4, 3, 2]));

        // Assert
        Assert.False(close.AllCommittedPaid);
        Assert.Equal(0, close.CommittedStreakMonths);
    }

    [Fact]
    public async Task GetMonthCloseAsync_RentMissedEarlier_CountsOnlyTheUnbrokenMonths()
    {
        // Act: rent is missing three months back, so only the closing month and the one before count.
        var close = await CloseMonthAsync(CloseRows(rentMonthsBack: [4, 2, 1]));

        // Assert
        Assert.True(close.AllCommittedPaid);
        Assert.Equal(2, close.CommittedStreakMonths);
        Assert.Equal(7_200_000m, close.FreeBudget);
    }

    // ─── Month-close rules the fixture above does not exercise ──────────────────

    [Fact]
    public async Task GetMonthCloseAsync_RefundInASpendingCategory_IsNotCountedAsSpending()
    {
        // Arrange: money coming back is income, even when it is filed under Shopping.
        var rows = CloseRows();
        rows.Add(CashflowRows.Tx(900, Day(1, 15), "Income", "Shopping", 6_000_000m, "Refund"));

        // Act
        var close = await CloseMonthAsync(rows);

        // Assert: Shopping spending is still 700,000, so Food stays the biggest driver.
        Assert.Equal("Food", close.BiggestDriverCategory);
        Assert.Equal(7_500_000m, close.BiggestDriverAmount);
        Assert.Equal(3_000_000m, close.BiggestDriverUsual);
    }

    [Fact]
    public async Task GetMonthCloseAsync_CommittedBillRises_IsNotNamedAsTheFreeOverspendDriver()
    {
        // Act: rent rises to 9,000,000. It is committed, so it is not part of free spending.
        var close = await CloseMonthAsync(CloseRows(closingRent: 9_000_000m));

        // Assert: free spending is unchanged, and the cause shown for its overspend must be in it.
        Assert.Equal(8_200_000m, close.FreeSpent);
        Assert.Equal("Food", close.BiggestDriverCategory);
    }

    [Fact]
    public async Task GetMonthCloseAsync_OneOffBillBesideACommittedOne_DriverCountsOnlyTheFreePart()
    {
        // Arrange: a one-off 5,000,000 bill is free spending; the rent in the same category is not.
        var rows = CloseRows();
        rows.Add(CashflowRows.Tx(902, Day(1, 16), "Expense", "Bill", 5_000_000m, "Car repair"));

        // Act
        var close = await CloseMonthAsync(rows);

        // Assert: free Bill spending rose from 0 to 5,000,000, more than Food's 4,500,000 rise.
        Assert.Equal("Bill", close.BiggestDriverCategory);
        Assert.Equal(5_000_000m, close.BiggestDriverAmount);
        Assert.Equal(0m, close.BiggestDriverUsual);
    }

    [Fact]
    public async Task GetMonthCloseAsync_Transfers_NameTheSourceAccount()
    {
        // Act
        var close = await CloseMonthAsync(CloseRows());

        // Assert: buckets-build-plan.md Ticket 3, "list the transfers that were found: date, from, to, amount".
        Assert.All(close.Transfers, t => Assert.Equal("BCA Tahapan", t.From));
    }

    [Fact]
    public async Task GetMonthCloseAsync_LateEveningRowOnLastDay_StaysInItsStatementMonth()
    {
        // Arrange: StatementDate.FromSdk's rule. The stored clock time is the statement's own, so this
        // row belongs to the month before the closing one. Only a host ahead of UTC can move it.
        var rows = CloseRows();
        rows.Add(CashflowRows.Tx(
            901, LastDay(2), "Expense", "Food", 1_000_000m, "Late dinner", time: "20:00:00"));

        // Act
        var close = await CloseMonthAsync(rows);

        // Assert
        Assert.Equal(8_200_000m, close.FreeSpent);
    }

    [Theory]
    [InlineData("close")]
    [InlineData("current")]
    public async Task Read_TransactionDateRange_CoversTheWholeLastDay(string view)
    {
        // Arrange: bank statements such as NeoBank's keep a clock time. The fake does not filter, so
        // this checks the upper bound the service sends.
        await using var fake = await StartFakeAsync();
        var service = await CreateServiceAsync(fake, CreateMutations());
        var lastDay = view == "close" ? LastDay(1) : DateTime.Today;

        // Act
        if (view == "close") await service.GetMonthCloseAsync();
        else await service.GetBucketsAsync();

        // Assert
        var query = CashflowRows.Query(Assert.Single(fake.RequestsTo("GET", "transactions")));
        var eveningRow = new DateTimeOffset(lastDay.Year, lastDay.Month, lastDay.Day, 20, 0, 0, TimeSpan.Zero);
        Assert.True(UpperBoundAdmits(query, eveningRow), $"A row at {eveningRow:u} is outside: {query}");
        // And no further: the next day's first date-only row stays out.
        var nextDay = new DateTimeOffset(lastDay.Year, lastDay.Month, lastDay.Day, 0, 0, 0, TimeSpan.Zero).AddDays(1);
        Assert.False(UpperBoundAdmits(query, nextDay), $"A row at {nextDay:u} is inside: {query}");
    }

    [Fact]
    public async Task GetBucketsAsync_LastSevenDays_CoversTodayAndTheSixDaysBefore()
    {
        // Arrange: the screen divides this total by 7, so it must hold exactly seven calendar days.
        var today = DateTime.Today;
        await using var fake = await StartFakeAsync(CashflowRows.Json(
            CashflowRows.Tx(1, today, "Expense", "Food", 100_000m, "Lunch", time: "12:30:00"),
            CashflowRows.Tx(2, today.AddDays(-6), "Expense", "Food", 20_000m, "Snack"),
            CashflowRows.Tx(3, today.AddDays(-7), "Expense", "Food", 1_000_000m, "Dinner")));
        var service = await CreateServiceAsync(fake, CreateMutations());

        // Act
        var result = await service.GetBucketsAsync();

        // Assert: 100,000 today + 20,000 six days ago. The eighth day back is outside.
        Assert.Equal(120_000m, result.Last7DayFreeSpend);
    }

    [Fact]
    public async Task GetBucketsAsync_CommittedItem_NamesItsSourceAccount()
    {
        // Arrange: buckets-build-plan.md lists each commitment with its source account.
        var rows = CloseRows();
        await using var fake = await StartFakeAsync(CashflowRows.Json(rows));
        fake.On("GET", "accounts",
            CashflowRows.Json(CashflowRows.Account(SourceAccountId, "BCA Tahapan")));
        var service = await CreateServiceAsync(fake, CreateMutations());

        // Act
        var result = await service.GetBucketsAsync();

        // Assert
        Assert.Equal("BCA Tahapan", Assert.Single(result.Items, i => i.Key == "room rent").Source);
    }

    private static bool UpperBoundAdmits(string query, DateTimeOffset stored)
    {
        var match = Regex.Match(query, @"date=(lte|lt)\.([^&]+)");
        Assert.True(match.Success, $"No upper date bound in: {query}");
        // A bound with no offset is read as UTC, the database's time zone.
        var bound = DateTimeOffset.Parse(
            match.Groups[2].Value.Trim('"'), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal);
        return match.Groups[1].Value == "lte" ? stored <= bound : stored < bound;
    }

    [Fact]
    public async Task GetBucketsAsync_NoTransactions_ReturnsZeroFigures()
    {
        // Arrange
        await using var fake = await StartFakeAsync();
        var service = await CreateServiceAsync(fake, CreateMutations());

        // Act
        var result = await service.GetBucketsAsync();

        // Assert
        Assert.Equal(0, result.MonthsAvailable);
        Assert.Equal(0m, result.FreeBudget);
        Assert.Empty(result.Items);
        foreach (var table in new[] { "transactions", "accounts", "bucket_category_overrides", "bucket_settings" })
        {
            var request = Assert.Single(fake.RequestsTo("GET", table));
            Assert.Contains($"user_id=eq.{TestCaller.Id}", CashflowRows.Query(request));
        }
    }

    [Fact]
    public async Task GetBucketsAsync_WithCommittedItem_DetectsIt()
    {
        // Arrange
        await using var fake = await StartFakeAsync(ThreeTrailingMonthsOfRent());
        var service = await CreateServiceAsync(fake, CreateMutations());

        // Act
        var result = await service.GetBucketsAsync();

        // Assert
        var rent = Assert.Single(result.Items, i => i.Key == "room rent");
        Assert.True(rent.Certain);
        Assert.False(rent.Paid);
        // Median of three equal payments, and of three equal monthly committed totals.
        Assert.Equal(1_800_000m, rent.Amount);
        Assert.Equal(1_800_000m, result.Committed);
        Assert.Equal(3, result.MonthsAvailable);
    }

    [Fact]
    public async Task SetFuturePlanAsync_DelegatesToMutations()
    {
        // Arrange
        await using var fake = await StartFakeAsync();
        var mutations = CreateMutations();
        var service = await CreateServiceAsync(fake, mutations);

        // Act
        await service.SetFuturePlanAsync(500_000m);

        // Assert
        mutations.Verify(m => m.SetFuturePlanAsync(500_000m, It.IsAny<CancellationToken>()), Times.Once);
        // The checked function is the only write: the service itself sends reads.
        Assert.All(fake.Requests, r => Assert.Equal("GET", r.Method));
    }

    [Fact]
    public async Task DemoteCommittedItemAsync_DelegatesToMutations()
    {
        // Arrange
        await using var fake = await StartFakeAsync();
        var mutations = CreateMutations();
        var service = await CreateServiceAsync(fake, mutations);

        // Act
        await service.DemoteCommittedItemAsync("room rent");

        // Assert
        mutations.Verify(m => m.DemoteCommittedItemAsync("room rent", It.IsAny<CancellationToken>()), Times.Once);
        Assert.All(fake.Requests, r => Assert.Equal("GET", r.Method));
    }
}
