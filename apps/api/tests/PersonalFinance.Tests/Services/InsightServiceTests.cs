using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Services;

public class InsightServiceTests
{
    private static Transaction Expense(string cat, decimal amount, DateTime date, string wallet = "BCA") =>
        new() { Type = "Expense", Category = cat, AmountIdr = amount, Date = date, Wallet = wallet, Description = $"Test {cat}" };

    private static Transaction Income(string cat, decimal amount, DateTime date, string wallet = "BCA") =>
        new() { Type = "Income", Category = cat, AmountIdr = amount, Date = date, Wallet = wallet, Description = $"Test income" };

    // ── statement_gap ──────────────────────────────────────────────────────

    [Fact]
    public void DetectStatementGaps_WalletLastTxOlderThan35Days_ReturnsAlert()
    {
        var today = DateTime.Today;
        var old = Expense("Food", 100_000m, today.AddDays(-40));
        var result = InsightService.DetectStatementGaps(new[] { old }.ToList(), new List<Transaction>(), today).ToList();
        Assert.Single(result);
        Assert.Equal("alert", result[0].Severity);
        Assert.Contains("BCA", result[0].Title);
    }

    [Fact]
    public void DetectStatementGaps_WalletHasRecentTx_ReturnsNoInsight()
    {
        var today = DateTime.Today;
        var recent = Expense("Food", 100_000m, today.AddDays(-5));
        var result = InsightService.DetectStatementGaps(new[] { recent }.ToList(), new List<Transaction>(), today).ToList();
        Assert.Empty(result);
    }

    // ── habit_break (investment) ───────────────────────────────────────────

    [Fact]
    public void DetectHabitBreaks_Investment_PresentIn2TrailingMonthsButNotCurrent_ReturnsStreakBreak()
    {
        var today = DateTime.Today;
        var m1 = today.AddMonths(-1);
        var m2 = today.AddMonths(-2);
        var trailing = new List<Transaction>
        {
            Expense("Stocks", 1_000_000m, new DateTime(m1.Year, m1.Month, 10)),
            Expense("Stocks", 1_000_000m, new DateTime(m2.Year, m2.Month, 10)),
        };
        var trailingMonths = Enumerable.Range(1, 3).Select(i => new DateTime(today.Year, today.Month, 1).AddMonths(-i)).ToList();
        var result = InsightService.DetectHabitBreaks(new List<Transaction>(), trailing, trailingMonths,
            new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Stocks", "Investment", "Saham", "Mutual Fund", "Reksa Dana", "SBN", "ORI", "Crypto", "P2P" },
            "investment").ToList();
        Assert.Single(result);
        Assert.Equal("streak_break", result[0].Severity);
    }

    [Fact]
    public void DetectHabitBreaks_Investment_OnlyOneTrailingMonth_ReturnsNoInsight()
    {
        var today = DateTime.Today;
        var m1 = today.AddMonths(-1);
        var trailing = new List<Transaction>
        {
            Expense("Stocks", 1_000_000m, new DateTime(m1.Year, m1.Month, 10)),
        };
        var trailingMonths = Enumerable.Range(1, 3).Select(i => new DateTime(today.Year, today.Month, 1).AddMonths(-i)).ToList();
        var result = InsightService.DetectHabitBreaks(new List<Transaction>(), trailing, trailingMonths,
            new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Stocks", "Investment" }, "investment").ToList();
        Assert.Empty(result);
    }

    // ── over_budget ────────────────────────────────────────────────────────

    [Fact]
    public void DetectOverBudget_Category130PctAboveAvg_AfterDay15_ReturnsWarning()
    {
        var today = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 20);
        var m1 = today.AddMonths(-1);
        var m2 = today.AddMonths(-2);
        var m3 = today.AddMonths(-3);
        var trailing = new List<Transaction>
        {
            Expense("Coffee", 300_000m, new DateTime(m1.Year, m1.Month, 5)),
            Expense("Coffee", 300_000m, new DateTime(m2.Year, m2.Month, 5)),
            Expense("Coffee", 300_000m, new DateTime(m3.Year, m3.Month, 5)),
        };
        var trailingMonths = Enumerable.Range(1, 3).Select(i => new DateTime(today.Year, today.Month, 1).AddMonths(-i)).ToList();
        var current = new List<Transaction>
        {
            Expense("Coffee", 500_000m, today.AddDays(-1))
        };
        var result = InsightService.DetectOverBudget(current, trailing, trailingMonths, today).ToList();
        Assert.Single(result);
        Assert.Equal("warning", result[0].Severity);
        Assert.Equal("Coffee", result[0].Category);
    }

    // ── under_budget ───────────────────────────────────────────────────────

    [Fact]
    public void DetectUnderBudget_Category70PctBelowAvg_NearEndOfMonth_ReturnsWin()
    {
        var daysInMonth = DateTime.DaysInMonth(DateTime.Today.Year, DateTime.Today.Month);
        var today = new DateTime(DateTime.Today.Year, DateTime.Today.Month, daysInMonth - 1);
        var m1 = today.AddMonths(-1);
        var m2 = today.AddMonths(-2);
        var m3 = today.AddMonths(-3);
        var trailing = new List<Transaction>
        {
            Expense("Food", 1_000_000m, new DateTime(m1.Year, m1.Month, 5)),
            Expense("Food", 1_000_000m, new DateTime(m2.Year, m2.Month, 5)),
            Expense("Food", 1_000_000m, new DateTime(m3.Year, m3.Month, 5)),
        };
        var trailingMonths = Enumerable.Range(1, 3).Select(i => new DateTime(today.Year, today.Month, 1).AddMonths(-i)).ToList();
        var current = new List<Transaction>
        {
            Expense("Food", 400_000m, today.AddDays(-1))
        };
        var result = InsightService.DetectUnderBudget(current, trailing, trailingMonths, today).ToList();
        Assert.Single(result);
        Assert.Equal("win", result[0].Severity);
    }

    // ── large_transaction ──────────────────────────────────────────────────

    [Fact]
    public void DetectLargeTransactions_SingleTxDoubleMonthlyAvg_ReturnsInfo()
    {
        var today = DateTime.Today;
        var m1 = today.AddMonths(-1);
        var m2 = today.AddMonths(-2);
        var m3 = today.AddMonths(-3);
        var trailing = new List<Transaction>
        {
            Expense("Medical", 200_000m, new DateTime(m1.Year, m1.Month, 5)),
            Expense("Medical", 200_000m, new DateTime(m2.Year, m2.Month, 5)),
            Expense("Medical", 200_000m, new DateTime(m3.Year, m3.Month, 5)),
        };
        var trailingMonths = Enumerable.Range(1, 3).Select(i => new DateTime(today.Year, today.Month, 1).AddMonths(-i)).ToList();
        var current = new List<Transaction>
        {
            Expense("Medical", 1_500_000m, today.AddDays(-2))
        };
        var result = InsightService.DetectLargeTransactions(current, trailing, trailingMonths).ToList();
        Assert.Single(result);
        Assert.Equal("info", result[0].Severity);
    }
}
