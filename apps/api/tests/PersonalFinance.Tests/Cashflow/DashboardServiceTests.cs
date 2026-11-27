using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Tests.Support;
using Supabase.Postgrest.Exceptions;
using static PersonalFinance.Tests.Cashflow.CashflowRows;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// DashboardService against hand-checked fixtures. Every expected amount below was worked out on
/// paper from the fixture before the code ran. "Spending" follows scoring-rubric.md "Spending vs
/// saving": an Expense row moved to saving or investing is not consumption. The rubric's set is
/// {Investment, Savings Transfer, Investasi, Tabungan}; the code's own investing list is
/// CashflowSectionMapping's Investing section (Stock, Mutual Fund, ...). Both count as transfers here.
/// </summary>
public sealed class DashboardServiceTests
{
    private static readonly Guid AccountA = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");

    private static async Task<(FakePostgrest Fake, DashboardService Service)> StartAsync()
    {
        var fake = await FakePostgrest.StartAsync();
        var client = await fake.CreateClientAsync();
        return (fake, new DashboardService(
            Mock.Of<ITransactionService>(), client, NullLogger<DashboardService>.Instance, new TestCaller()));
    }

    /// <summary>
    /// Current period Jan–Mar 2026 (year 2026, month 3, months 3); previous period Oct–Dec 2025.
    /// <code>
    /// #  date        type     category    amount_idr   note
    /// 1  2026-03-02  Income   Salary      10,000,000
    /// 2  2026-03-05  Expense  Food         1,500,000
    /// 3  2026-03-10  Expense  Investment   2,000,000   savings outflow, not consumption (rubric)
    /// 4  2026-02-03  Income   Salary      10,000,000
    /// 5  2026-02-14  Expense  Shopping     1,600,000   USD 100 at 16,000; only amount_idr counts
    /// 6  2026-02-20  Expense  Food           500,000
    /// 7  2025-12-15  Income   Salary       8,000,000   previous period
    /// 8  2025-12-20  Expense  Food         2,000,000   previous period
    /// </code>
    /// Hand totals, current period: income 20,000,000; consumption 1,500,000 + 1,600,000 + 500,000
    /// = 3,600,000; net (income − consumption) 16,400,000. Previous: income 8,000,000; consumption
    /// 2,000,000; net 6,000,000. January has no rows.
    /// </summary>
    private static string QuarterFixture() => Json(
        Tx(1, new DateTime(2026, 3, 2), "Income", "Salary", 10_000_000m, "PAYROLL"),
        Tx(2, new DateTime(2026, 3, 5), "Expense", "Food", 1_500_000m, "GROCER"),
        Tx(3, new DateTime(2026, 3, 10), "Expense", "Investment", 2_000_000m, "BIBIT"),
        Tx(4, new DateTime(2026, 2, 3), "Income", "Salary", 10_000_000m, "PAYROLL"),
        Tx(5, new DateTime(2026, 2, 14), "Expense", "Shopping", 1_600_000m, "AMAZON", currency: "USD", exchangeRate: 16_000m),
        Tx(6, new DateTime(2026, 2, 20), "Expense", "Food", 500_000m, "WARUNG"),
        Tx(7, new DateTime(2025, 12, 15), "Income", "Salary", 8_000_000m, "PAYROLL"),
        Tx(8, new DateTime(2025, 12, 20), "Expense", "Food", 2_000_000m, "GROCER"));

    // ── GetDashboardDataAsync ─────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboardDataAsync_QuarterFixture_IncomeAndMonthsWithoutTransfersMatchHandTotals()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", QuarterFixture());

        // Act
        var dto = await service.GetDashboardDataAsync(null, 2026, 3, 3);

        // Assert
        Assert.Equal(20_000_000m, dto.Summary.TotalIncome);        // 10,000,000 + 10,000,000
        Assert.Equal(6, dto.Summary.TransactionCount);             // rows 1–6
        Assert.Equal("3 Months ending Mar 26", dto.CurrentMonth.Month);
        Assert.Equal(20_000_000m, dto.CurrentMonth.Income);
        Assert.Equal(150.0m, dto.CurrentMonth.IncomeChangePercent); // (20,000,000 − 8,000,000) / 8,000,000 × 100
        Assert.Equal("March 2026", dto.DataThrough);

        Assert.Equal(["Jan 26", "Feb 26", "Mar 26"], dto.CashFlow.Select(m => m.Month));
        Assert.Equal(new DashboardCashFlowDto("Jan 26", 0m, 0m, 0m), dto.CashFlow[0]);   // month with no data
        // Feb: 10,000,000 in; 1,600,000 (USD row, amount_idr) + 500,000 out; net 7,900,000
        Assert.Equal(new DashboardCashFlowDto("Feb 26", 10_000_000m, 2_100_000m, 7_900_000m), dto.CashFlow[1]);
        Assert.Equal(10_000_000m, dto.CashFlow[2].Income);

        var request = Assert.Single(fake.Requests);
        var query = Query(request);
        Assert.Contains($"user_id=eq.{TestCaller.Id}", query);
        Assert.Contains("date=gte.2025-10-01T00:00:00.0000000", query); // previous period start
        Assert.Contains("date=lte.2026-03-31T23:59:59.0000000", query); // end of March
        Assert.DoesNotContain("account_id=", query);
        Assert.Equal("0-999", request.Headers["Range"]);
    }

    [Fact]
    public async Task GetDashboardDataAsync_InvestmentTransfer_IsNotCountedAsSpending()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", QuarterFixture());

        // Act
        var dto = await service.GetDashboardDataAsync(null, 2026, 3, 3);

        // Assert: scoring-rubric.md "Spending vs saving" — the 2,000,000 Investment row is a
        // savings outflow, so March spending is the 1,500,000 Food row only.
        Assert.Equal(new DashboardCashFlowDto("Mar 26", 10_000_000m, 1_500_000m, 8_500_000m), dto.CashFlow[2]);
        Assert.Equal(3_600_000m, dto.Summary.TotalExpenses);            // 1,500,000 + 1,600,000 + 500,000
        Assert.Equal(16_400_000m, dto.Summary.NetWorth);               // 20,000,000 − 3,600,000
        Assert.Equal(3_600_000m, dto.CurrentMonth.Expenses);
        Assert.Equal(16_400_000m, dto.CurrentMonth.Net);
        Assert.Equal(80.0m, dto.CurrentMonth.ExpenseChangePercent);    // (3,600,000 − 2,000,000) / 2,000,000 × 100
        Assert.Equal(173.3m, dto.CurrentMonth.NetChangePercent);       // (16,400,000 − 6,000,000) / 6,000,000 × 100 = 173.33
    }

    [Fact]
    public async Task GetDashboardDataAsync_TopCategories_ExcludeTransfersAndSumToSpending()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", QuarterFixture());

        // Act
        var dto = await service.GetDashboardDataAsync(null, 2026, 3, 3);

        // Assert: Food 1,500,000 + 500,000 = 2,000,000 (55.6% of 3,600,000); Shopping 1,600,000 (44.4%).
        Assert.Equal(
            [new DashboardTopCategoryDto("Food", 2_000_000m, 55.6m, 2), new DashboardTopCategoryDto("Shopping", 1_600_000m, 44.4m, 1)],
            dto.TopCategories);
        Assert.Equal(dto.CurrentMonth.Expenses, dto.TopCategories.Sum(c => c.Amount));
    }

    [Fact]
    public async Task GetDashboardDataAsync_StockPurchase_LeftOutOfMonthlySpendingAndTopCategories()
    {
        // Arrange: Stock is in CashflowSectionMapping's Investing section.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(
            Tx(1, new DateTime(2026, 3, 2), "Income", "Salary", 10_000_000m),
            Tx(2, new DateTime(2026, 3, 5), "Expense", "Food", 1_000_000m),
            Tx(3, new DateTime(2026, 3, 9), "Expense", "Stock", 3_000_000m)));

        // Act
        var dto = await service.GetDashboardDataAsync(null, 2026, 3, 1);

        // Assert: March spending 1,000,000; net 10,000,000 − 1,000,000 = 9,000,000.
        Assert.Equal("March 2026", dto.CurrentMonth.Month);
        Assert.Equal(new DashboardCashFlowDto("Mar 26", 10_000_000m, 1_000_000m, 9_000_000m), Assert.Single(dto.CashFlow));
        var top = Assert.Single(dto.TopCategories);
        Assert.Equal(("Food", 1_000_000m, 1), (top.Category, top.Amount, top.TransactionCount));
    }

    [Fact]
    public async Task GetDashboardDataAsync_LateEveningRowOnLastDay_CountsInItsStatementMonth()
    {
        // Arrange: a statement line dated 31 Mar 2026 23:30, stored as 2026-03-31T23:30:00+00:00
        // (NeoBankPdfParser marks the statement's clock time as UTC). The SDK converts timestamptz
        // values to the host's local time, so on a UTC+8 host the row reads back as 1 Apr 07:30.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(
            Tx(1, new DateTime(2026, 3, 2), "Income", "Salary", 10_000_000m),
            Tx(2, new DateTime(2026, 3, 31), "Expense", "Food", 100_000m, time: "23:30:00")));

        // Act
        var dto = await service.GetDashboardDataAsync(null, 2026, 3, 1);

        // Assert: the statement says March, so March spending is 100,000 and net 9,900,000.
        Assert.Equal(new DashboardCashFlowDto("Mar 26", 10_000_000m, 100_000m, 9_900_000m), Assert.Single(dto.CashFlow));
    }

    [Fact]
    public async Task GetDashboardDataAsync_NoTransactions_ReturnsZeroedSixMonthsFromLatestQuery()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]");

        // Act
        var dto = await service.GetDashboardDataAsync(null, null, null);

        // Assert
        Assert.Equal(new DashboardSummaryDto(0m, 0m, 0m, 0), dto.Summary);
        Assert.Equal(6, dto.CashFlow.Count);
        Assert.All(dto.CashFlow, m => Assert.Equal((0m, 0m, 0m), (m.Income, m.Expenses, m.Net)));
        Assert.Empty(dto.TopCategories);
        Assert.Equal((0m, 0m, 0m), (dto.CurrentMonth.IncomeChangePercent, dto.CurrentMonth.ExpenseChangePercent, dto.CurrentMonth.NetChangePercent));
        // First request finds the latest transaction to anchor the range.
        var latest = Query(fake.Requests[0]);
        Assert.Contains("order=date.desc", latest);
        Assert.Contains("limit=1", latest);
    }

    [Fact]
    public async Task GetDashboardDataAsync_AllTime_SpansEarliestToLatestMonth()
    {
        // Arrange: earliest row Nov 2025, latest Mar 2026: five months, Nov through Mar.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        var latest = Tx(2, new DateTime(2026, 3, 10), "Expense", "Food", 300_000m);
        var earliest = Tx(1, new DateTime(2025, 11, 10), "Income", "Salary", 5_000_000m);
        fake.On("GET", "transactions", r =>
        {
            var query = Query(r);
            if (!query.Contains("limit=1")) return new FakeResponse(Json(latest, earliest));
            return new FakeResponse(Json(query.Contains("date.asc") ? earliest : latest));
        });

        // Act
        var dto = await service.GetDashboardDataAsync(AccountA, null, null, -1);

        // Assert
        Assert.Equal("All Time", dto.CurrentMonth.Month);
        Assert.Equal(["Nov 25", "Dec 25", "Jan 26", "Feb 26", "Mar 26"], dto.CashFlow.Select(m => m.Month));
        Assert.Equal(5_000_000m, dto.CashFlow[0].Income);
        Assert.Equal(300_000m, dto.CashFlow[4].Expenses);
        Assert.Equal(5_000_000m - 300_000m, dto.Summary.NetWorth);
        var range = fake.Requests.Last();
        Assert.Contains($"account_id=eq.{AccountA}", Query(range));
        Assert.Contains("date=gte.2025-06-01T00:00:00.0000000", Query(range)); // five months before Nov 2025
    }

    [Fact]
    public async Task GetDashboardDataAsync_YearToDate_CoversJanuaryThroughBaselineMonth()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", QuarterFixture());

        // Act
        var dto = await service.GetDashboardDataAsync(null, 2026, 3, 0);

        // Assert
        Assert.Equal("YTD 2026", dto.CurrentMonth.Month);
        Assert.Equal(["Jan 26", "Feb 26", "Mar 26"], dto.CashFlow.Select(m => m.Month));
    }

    [Fact]
    public async Task GetDashboardDataAsync_FullPage_FetchesNextPage()
    {
        // Arrange: 1,000 rows of 1,000 income on page one, one 500 row on page two.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        var page1 = Enumerable.Range(1, 1000).Select(i => Tx(i, new DateTime(2026, 3, 10), "Income", "Salary", 1_000m));
        var page2 = new[] { Tx(1001, new DateTime(2026, 3, 11), "Income", "Salary", 500m) };
        fake.On("GET", "transactions", r => new FakeResponse(r.Headers["Range"] == "0-999" ? Json(page1) : Json(page2)));

        // Act
        var dto = await service.GetDashboardDataAsync(null, 2026, 3, 1);

        // Assert: 1,000 × 1,000 + 500 = 1,000,500
        Assert.Equal(1_000_500m, dto.Summary.TotalIncome);
        Assert.Equal(["0-999", "1000-1999"], fake.Requests.Select(r => r.Headers["Range"]));
    }

    [Fact]
    public async Task GetDashboardDataAsync_PostgrestError_ThrowsSdkException()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", ServerError, 500);

        // Act
        var exception = await Assert.ThrowsAsync<PostgrestException>(() => service.GetDashboardDataAsync(null, 2026, 3));

        // Assert: nothing is caught or rewrapped; the exception middleware returns the generic 500.
        Assert.Equal(500, exception.StatusCode);
    }

    // ── GetCashflowStatementAsync ─────────────────────────────────────────────

    /// <summary>
    /// Latest row is 12 Mar 2026, so months = 3 covers Jan–Mar 2026.
    /// <code>
    /// date        type     category       amount_idr  section (CashflowSectionMapping)
    /// 2026-03-02  Income   Salary         10,000,000  operating income
    /// 2026-03-05  Expense  Food            1,500,000  operating expense
    /// 2026-03-12  Expense  Stock           1,000,000  investing (a purchase: cash out)
    /// 2026-02-03  Income   Salary         10,000,000  operating income
    /// 2026-02-10  Income   Bank Transfer     300,000  operating income (special case, CR)
    /// 2026-02-20  Expense  Food              500,000  operating expense
    /// 2026-02-25  Expense  Loan              700,000  financing (a repayment: cash out)
    /// 2026-01-10  Expense  Gift              200,000  operating expense (special case, DB)
    /// </code>
    /// Operating: Mar 10,000,000 − 1,500,000 = 8,500,000; Feb 10,300,000 − 500,000 = 9,800,000;
    /// Jan −200,000. Statement of cash flows sign convention (IAS 7): cash out is negative, so
    /// investing Mar −1,000,000 and financing Feb −700,000. Net change in cash: Mar 7,500,000;
    /// Feb 9,100,000; Jan −200,000.
    /// </summary>
    private static readonly object[] StatementRows =
    [
        Tx(1, new DateTime(2026, 3, 2), "Income", "Salary", 10_000_000m),
        Tx(2, new DateTime(2026, 3, 5), "Expense", "Food", 1_500_000m),
        Tx(3, new DateTime(2026, 3, 12), "Expense", "Stock", 1_000_000m),
        Tx(4, new DateTime(2026, 2, 3), "Income", "Salary", 10_000_000m),
        Tx(5, new DateTime(2026, 2, 10), "Income", "Bank Transfer", 300_000m),
        Tx(6, new DateTime(2026, 2, 20), "Expense", "Food", 500_000m),
        Tx(7, new DateTime(2026, 2, 25), "Expense", "Loan", 700_000m),
        Tx(8, new DateTime(2026, 1, 10), "Expense", "Gift", 200_000m),
    ];

    private static void StubStatement(FakePostgrest fake, object[] rows) =>
        fake.On("GET", "transactions", r =>
        {
            var query = Query(r);
            if (!query.Contains("limit=1")) return new FakeResponse(Json(rows));
            if (rows.Length == 0) return new FakeResponse("[]");
            return new FakeResponse(Json(query.Contains("date.asc") ? rows[^1] : rows[2]));
        });

    private static Dictionary<string, decimal> ByPeriod(decimal mar, decimal feb, decimal jan) =>
        new() { ["Mar 26"] = mar, ["Feb 26"] = feb, ["Jan 26"] = jan };

    [Fact]
    public async Task GetCashflowStatementAsync_Monthly_OperatingSectionMatchesHandTotals()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        StubStatement(fake, StatementRows);

        // Act
        var statement = await service.GetCashflowStatementAsync(3, null, "monthly");

        // Assert
        Assert.Equal(["Mar 26", "Feb 26", "Jan 26"], statement.Periods);
        var operating = statement.Sections.Single(s => s.Id == "operating");
        var income = operating.Subsections.Single(s => s.Id == "operating_income");
        var expense = operating.Subsections.Single(s => s.Id == "operating_expense");
        Assert.Equal(ByPeriod(10_000_000m, 10_000_000m, 0m), income.Categories.Single(c => c.Category == "Salary").Values);
        Assert.Equal(ByPeriod(0m, 300_000m, 0m), income.Categories.Single(c => c.Category == "Bank Transfer").Values);
        Assert.Equal(ByPeriod(10_000_000m, 10_300_000m, 0m), income.Totals);
        Assert.Equal(ByPeriod(-1_500_000m, -500_000m, 0m), expense.Categories.Single(c => c.Category == "Food").Values);
        Assert.Equal(ByPeriod(0m, 0m, -200_000m), expense.Categories.Single(c => c.Category == "Gift").Values);
        Assert.Equal(ByPeriod(-1_500_000m, -500_000m, -200_000m), expense.Totals);
        Assert.Equal(ByPeriod(8_500_000m, 9_800_000m, -200_000m), operating.Totals);
        Assert.Equal(["Stock"], statement.Sections.Single(s => s.Id == "investing").Subsections.Single().Categories.Select(c => c.Category));
        Assert.Equal(["Loan"], statement.Sections.Single(s => s.Id == "financing").Subsections.Single().Categories.Select(c => c.Category));

        var range = Query(fake.Requests.Last());
        Assert.Contains("date=gte.2026-01-01T00:00:00.0000000", range);
        Assert.Contains("date=lte.2026-03-31T23:59:59.0000000", range);
        Assert.Contains($"user_id=eq.{TestCaller.Id}", range);
    }

    [Fact]
    public async Task GetCashflowStatementAsync_Monthly_OutflowsAreNegativeInInvestingFinancingAndGrandTotal()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        StubStatement(fake, StatementRows);

        // Act
        var statement = await service.GetCashflowStatementAsync(3, null, "monthly");

        // Assert: IAS 7 sign convention; a stock purchase and a loan repayment are cash out.
        var investing = statement.Sections.Single(s => s.Id == "investing");
        var financing = statement.Sections.Single(s => s.Id == "financing");
        Assert.Equal(ByPeriod(-1_000_000m, 0m, 0m), investing.Totals);
        Assert.Equal(ByPeriod(0m, -700_000m, 0m), financing.Totals);
        // 8,500,000 − 1,000,000; 9,800,000 − 700,000; −200,000
        Assert.Equal(ByPeriod(7_500_000m, 9_100_000m, -200_000m), statement.GrandTotals);
    }

    [Fact]
    public async Task GetCashflowStatementAsync_Quarterly_GroupsMonthsIntoQuarter()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        StubStatement(fake, StatementRows);

        // Act
        var statement = await service.GetCashflowStatementAsync(3, AccountA, "quarterly");

        // Assert: Q1 2026 operating income 10,000,000 + 10,000,000 + 300,000 = 20,300,000;
        // operating expense −(1,500,000 + 500,000 + 200,000) = −2,200,000.
        Assert.Equal(["Q1 2026"], statement.Periods);
        var operating = statement.Sections.Single(s => s.Id == "operating");
        Assert.Equal(20_300_000m, operating.Subsections.Single(s => s.Id == "operating_income").Totals["Q1 2026"]);
        Assert.Equal(-2_200_000m, operating.Subsections.Single(s => s.Id == "operating_expense").Totals["Q1 2026"]);
        Assert.Equal(18_100_000m, operating.Totals["Q1 2026"]);
        Assert.Contains($"account_id=eq.{AccountA}", Query(fake.Requests.Last()));
    }

    [Fact]
    public async Task GetCashflowStatementAsync_AllTime_StartsAtEarliestMonth()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        StubStatement(fake, StatementRows);

        // Act
        var statement = await service.GetCashflowStatementAsync(-1, null, "monthly");

        // Assert: earliest row is 10 Jan 2026, latest 12 Mar 2026.
        Assert.Equal(["Mar 26", "Feb 26", "Jan 26"], statement.Periods);
        Assert.Contains(fake.Requests, r => Query(r).Contains("date.asc") && Query(r).Contains("limit=1"));
    }

    [Fact]
    public async Task GetCashflowStatementAsync_UncategorizedRows_FallBackOnType()
    {
        // Arrange: categories outside the mapping fall back on Type; a Transfer goes to financing.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        StubStatement(fake,
        [
            Tx(1, new DateTime(2026, 3, 2), "Income", "Bonus", 1_000_000m),
            Tx(2, new DateTime(2026, 3, 3), "Expense", "Parking", 50_000m),
            Tx(3, new DateTime(2026, 3, 4), "Transfer", "Own Account", 400_000m),
        ]);

        // Act
        var statement = await service.GetCashflowStatementAsync(1, null, "monthly");

        // Assert
        var operating = statement.Sections.Single(s => s.Id == "operating");
        Assert.Equal(1_000_000m, operating.Subsections.Single(s => s.Id == "operating_income").Categories.Single(c => c.Category == "Bonus").Values["Mar 26"]);
        Assert.Equal(-50_000m, operating.Subsections.Single(s => s.Id == "operating_expense").Categories.Single(c => c.Category == "Parking").Values["Mar 26"]);
        Assert.Equal(["Own Account"], statement.Sections.Single(s => s.Id == "financing").Subsections.Single().Categories.Select(c => c.Category));
    }

    [Fact]
    public async Task GetCashflowStatementAsync_NoTransactions_ReturnsSixEmptyPeriods()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        StubStatement(fake, []);

        // Act
        var statement = await service.GetCashflowStatementAsync(6, null, "monthly");

        // Assert
        Assert.Equal(6, statement.Periods.Count);
        Assert.All(statement.GrandTotals.Values, v => Assert.Equal(0m, v));
        Assert.All(statement.Sections, s => Assert.All(s.Subsections, sub => Assert.Empty(sub.Categories)));
    }

    [Fact]
    public async Task GetCashflowStatementAsync_PostgrestError_ThrowsSdkException()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", ServerError, 500);

        // Act + Assert
        await Assert.ThrowsAsync<PostgrestException>(() => service.GetCashflowStatementAsync(3, null, "monthly"));
    }
}
