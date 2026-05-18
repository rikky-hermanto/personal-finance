using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests;

public class DeduplicationTests
{
    private static readonly Guid TestAccountId = Guid.Parse("00000000-0000-0000-0000-000000000001");
    private static readonly Guid OtherAccountId = Guid.Parse("00000000-0000-0000-0000-000000000002");

    [Fact]
    public void FilterLogic_IntraBatchDuplicates_FilteredOut()
    {
        // Arrange
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB" },
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB" }, // Duplicate
            new() { Date = date, AmountIdr = 200, Description = "Makan", AccountId = TestAccountId, Flow = "DB" }
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
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB" }
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
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", BankRunningBalance = 1000 }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", BankRunningBalance = 1100 }
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
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", BankRunningBalance = 1000 }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", BankRunningBalance = 1000 }
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
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", BankRunningBalance = 1000 }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", BankRunningBalance = null } // Legacy
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
            new() { Date = date, AmountIdr = 100, Description = " KOPI ", AccountId = TestAccountId, Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "kopi", AccountId = TestAccountId, Flow = "DB" }
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
            new() { Date = date, AmountIdr = 100.004m, Description = "Kopi", AccountId = TestAccountId, Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100.00m, Description = "Kopi", AccountId = TestAccountId, Flow = "DB" }
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
            new() { Date = date, AmountIdr = 100, Description = "Initial   Balance", AccountId = TestAccountId, Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Initial Balance", AccountId = TestAccountId, Flow = "DB" }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public void FilterLogic_DifferentAccountId_NotFilteredOut()
    {
        // Arrange — same transaction text but different bank account -> distinct, not a duplicate
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = OtherAccountId, Flow = "DB" }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Single(result); // Different account -> not a duplicate
    }
}
