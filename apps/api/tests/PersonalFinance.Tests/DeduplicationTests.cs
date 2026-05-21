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
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", StatementBalance = 1000 }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", StatementBalance = 1100 }
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
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", StatementBalance = 1000 }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", StatementBalance = 1000 }
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
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", StatementBalance = 1000 }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB", StatementBalance = null } // Legacy
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

    // ── Null AccountId edge cases (PF-115 account integration) ───────────────

    [Fact]
    public void FilterLogic_NullAccountId_TreatedAsDifferentFromNamedAccount()
    {
        // Arrange — same details but incoming has null AccountId (unlinked), existing has a real account.
        // Null and a real Guid produce different key strings, so they must NOT deduplicate.
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = null, Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = TestAccountId, Flow = "DB" }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Single(result);
    }

    [Fact]
    public void FilterLogic_BothNullAccountId_SameDetails_Deduped()
    {
        // Arrange — pre-migration transactions both have null AccountId; same details should still
        // deduplicate against each other so we don't double-import legacy data.
        var date = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = null, Flow = "DB" }
        };
        var existing = new List<Transaction>
        {
            new() { Date = date, AmountIdr = 100, Description = "Kopi", AccountId = null, Flow = "DB" }
        };

        // Act
        var result = TransactionService.FilterLogic(transactions, existing);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public void TagDuplicatesLogic_IntraBatch_TwoNullAccountId_SameDetails_SecondMarkedDuplicate()
    {
        // Arrange — two identical rows with null AccountId in the same upload batch
        var date = new DateTime(2024, 3, 1, 0, 0, 0, DateTimeKind.Utc);
        var transactions = new List<TransactionDto>
        {
            new() { Date = date, AmountIdr = 500_000, Description = "Gaji", AccountId = null, Flow = "CR" },
            new() { Date = date, AmountIdr = 500_000, Description = "Gaji", AccountId = null, Flow = "CR" },
        };

        // Act
        var result = TransactionService.TagDuplicatesLogic(transactions, new List<Transaction>());

        // Assert
        Assert.False(result[0].IsDuplicate);
        Assert.True(result[1].IsDuplicate);
    }
}
