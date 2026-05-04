using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests;

public class DeduplicationTests
{
    [Fact]
    public void FilterLogic_IntraBatchDuplicates_FilteredOut()
    {
        // Arrange
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "BCA", Flow = "DB" },
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "BCA", Flow = "DB" }, // Duplicate
            new() { Date = date, AmountIdr = 200, Description = "Makan", Wallet = "BCA", Flow = "DB" }
        };
        var existing = new List<Transaction>();

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Equal(2, result.Count);
        Assert.Contains(result, t => t.AmountIdr == 100);
        Assert.Contains(result, t => t.AmountIdr == 200);
    }

    [Fact]
    public void FilterLogic_ExistingInDatabase_FilteredOut()
    {
        // Arrange
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "BCA", Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "BCA", Flow = "DB" }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public void FilterLogic_TieredMatching_BalanceMismatch_Allowed()
    {
        // Arrange
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "BCA", Flow = "DB", BankRunningBalance = 1000 }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "BCA", Flow = "DB", BankRunningBalance = 1100 }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Single(result); // Same core details but different balance -> Different transaction
    }

    [Fact]
    public void FilterLogic_TieredMatching_BalanceMatch_FilteredOut()
    {
        // Arrange
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "BCA", Flow = "DB", BankRunningBalance = 1000 }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "BCA", Flow = "DB", BankRunningBalance = 1000 }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public void FilterLogic_MigrationFallback_OneSideLacksBalance_FilteredOut()
    {
        // Arrange
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "BCA", Flow = "DB", BankRunningBalance = 1000 }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "BCA", Flow = "DB", BankRunningBalance = null } // Legacy
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Empty(result); // Matches Regular Key and one side lacks balance -> Assume duplicate (migration fallback)
    }

    [Fact]
    public void FilterLogic_DifferentDescriptionCasingAndSpaces_FilteredOut()
    {
        // Arrange
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = " KOPI ", Wallet = "BCA", Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "kopi", Wallet = "BCA", Flow = "DB" }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public void FilterLogic_DifferentRounding_FilteredOut()
    {
        // Arrange
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100.004m, Description = "Kopi", Wallet = "BCA", Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100.00m, Description = "Kopi", Wallet = "BCA", Flow = "DB" }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Empty(result); // 100.004 rounds to 100.00
    }

    [Fact]
    public void FilterLogic_AggressiveNormalization_MultipleSpaces_FilteredOut()
    {
        // Arrange
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Initial   Balance", Wallet = "BCA", Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Initial Balance", Wallet = "bca", Flow = "DB" }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public void FilterLogic_MissingWalletNormalization_FilteredOut()
    {
        // Arrange
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = "", Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", Wallet = null!, Flow = "DB" }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Empty(result); // Both normalized to "unknown"
    }
}
