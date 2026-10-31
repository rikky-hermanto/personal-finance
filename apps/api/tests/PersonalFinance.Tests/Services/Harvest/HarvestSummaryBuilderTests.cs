using PersonalFinance.Application.Services.Harvest;

namespace PersonalFinance.Tests.Services.Harvest;

public class HarvestSummaryBuilderTests
{
    [Theory]
    [InlineData(10_000_000, 9_999_999, "green")]
    [InlineData(10_000_000, 10_000_000, "red")]   // a spend ratio of 1.00 is the rubric's 0-point breakpoint
    [InlineData(10_000_000, 12_000_000, "red")]
    [InlineData(0, 500_000, "neutral")]           // no income recorded is never green (FIN-04)
    public void Classify_ByIncomeAndExpense_ReturnsResult(int income, int expense, string expected)
    {
        // Act
        var result = HarvestSummaryBuilder.Classify(income, expense);

        // Assert
        Assert.Equal(expected, result);
    }

    [Fact]
    public void Build_OneAccountHasNoTransactions_CountsFourOfFive()
    {
        // Arrange
        Guid[] accounts = [Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()];
        var withTransactions = new HashSet<Guid>(accounts.Take(4));

        // Act
        var record = HarvestSummaryBuilder.Build(new DateOnly(2026, 9, 17), 10m, 8m, 40, accounts, withTransactions);

        // Assert
        Assert.NotNull(record);
        Assert.Equal(new DateOnly(2026, 9, 1), record.Month);
        Assert.Equal(4, record.AccountsCovered);
        Assert.Equal(5, record.AccountsTotal);
    }

    [Fact]
    public void Build_TransactionOnAccountOutsideTheList_IsNotCounted()
    {
        // Arrange
        Guid[] accounts = [Guid.NewGuid(), Guid.NewGuid()];
        var withTransactions = new HashSet<Guid> { accounts[0], Guid.NewGuid() };

        // Act
        var record = HarvestSummaryBuilder.Build(new DateOnly(2026, 9, 1), 10m, 8m, 3, accounts, withTransactions);

        // Assert
        Assert.NotNull(record);
        Assert.Equal(1, record.AccountsCovered);
        Assert.Equal(2, record.AccountsTotal);
    }

    [Fact]
    public void Coverage_NullAccountSet_CountsZeroOfTotal()
    {
        // Arrange
        Guid[] accounts = [Guid.NewGuid(), Guid.NewGuid()];

        // Act
        var (covered, total) = HarvestSummaryBuilder.Coverage(accounts, null);

        // Assert
        Assert.Equal((0, 2), (covered, total));
    }

    [Fact]
    public void Build_NoTransactionsInMonth_ReturnsNull()
    {
        // Act
        var record = HarvestSummaryBuilder.Build(
            new DateOnly(2026, 9, 1), 0m, 0m, 0, [Guid.NewGuid()], new HashSet<Guid>());

        // Assert
        Assert.Null(record);
    }
}
