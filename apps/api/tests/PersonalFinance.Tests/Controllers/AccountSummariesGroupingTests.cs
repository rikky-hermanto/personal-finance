using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Controllers;

/// <summary>
/// Tests for the pure LINQ grouping logic in TransactionsController.GetAccountSummaries.
/// Protects against the PF-115 regression where null AccountId (pre-migration transactions)
/// caused ArgumentNullException in .ToDictionary().
/// </summary>
public class AccountSummariesGroupingTests
{
    private static readonly Guid AccountA = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid AccountB = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");
    private static readonly Guid InstitutionX = Guid.Parse("cccccccc-0000-0000-0000-000000000003");

    // Mirrors the exact logic in GetAccountSummaries — must stay in sync if controller changes.
    private static Dictionary<Guid, (decimal TotalIn, decimal TotalOut, int Count)> BuildGrouped(
        List<Transaction> transactions)
    {
        return transactions
            .Where(t => t.AccountId.HasValue)
            .GroupBy(t => t.AccountId!.Value)
            .ToDictionary(
                g => g.Key,
                g => (
                    TotalIn:  g.Where(t => t.Type.Equals("Income",  StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr),
                    TotalOut: g.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr),
                    Count:    g.Count()
                ));
    }

    // ── Null AccountId guard (regression from PF-115) ────────────────────────

    [Fact]
    public void BuildGrouped_NullAccountId_DoesNotThrow()
    {
        // Arrange — pre-migration transactions have no linked account
        var transactions = new List<Transaction>
        {
            new() { AccountId = null, AmountIdr = 100, Type = "Expense", Flow = "DB", Description = "Old tx" }
        };

        // Act & Assert — must not throw ArgumentNullException
        var grouped = BuildGrouped(transactions);
        Assert.Empty(grouped);
    }

    [Fact]
    public void BuildGrouped_AllNullAccountIds_ReturnsEmptyDictionary()
    {
        var transactions = new List<Transaction>
        {
            new() { AccountId = null, AmountIdr = 500, Type = "Expense" },
            new() { AccountId = null, AmountIdr = 300, Type = "Income"  },
        };

        var grouped = BuildGrouped(transactions);

        Assert.Empty(grouped);
    }

    [Fact]
    public void BuildGrouped_MixedNullAndValid_OnlyValidAccountsIncluded()
    {
        var transactions = new List<Transaction>
        {
            new() { AccountId = AccountA, AmountIdr = 500, Type = "Expense", Flow = "DB", Description = "A" },
            new() { AccountId = null,     AmountIdr = 200, Type = "Expense", Flow = "DB", Description = "Old" },
            new() { AccountId = AccountA, AmountIdr = 300, Type = "Income",  Flow = "CR", Description = "B" },
        };

        var grouped = BuildGrouped(transactions);

        Assert.Single(grouped);
        Assert.True(grouped.ContainsKey(AccountA));
        Assert.Equal(300m,  grouped[AccountA].TotalIn);
        Assert.Equal(500m,  grouped[AccountA].TotalOut);
        Assert.Equal(2,     grouped[AccountA].Count);
    }

    // ── TotalIn / TotalOut aggregation ───────────────────────────────────────

    [Fact]
    public void BuildGrouped_IncomeTransactions_SummedInTotalIn()
    {
        var transactions = new List<Transaction>
        {
            new() { AccountId = AccountA, AmountIdr = 1_000_000, Type = "Income", Flow = "CR" },
            new() { AccountId = AccountA, AmountIdr =   500_000, Type = "Income", Flow = "CR" },
        };

        var grouped = BuildGrouped(transactions);

        Assert.Equal(1_500_000m, grouped[AccountA].TotalIn);
        Assert.Equal(0m,         grouped[AccountA].TotalOut);
    }

    [Fact]
    public void BuildGrouped_ExpenseTransactions_SummedInTotalOut()
    {
        var transactions = new List<Transaction>
        {
            new() { AccountId = AccountA, AmountIdr = 200_000, Type = "Expense", Flow = "DB" },
            new() { AccountId = AccountA, AmountIdr = 300_000, Type = "Expense", Flow = "DB" },
        };

        var grouped = BuildGrouped(transactions);

        Assert.Equal(0m,       grouped[AccountA].TotalIn);
        Assert.Equal(500_000m, grouped[AccountA].TotalOut);
    }

    [Fact]
    public void BuildGrouped_TypeComparison_IsCaseInsensitive()
    {
        var transactions = new List<Transaction>
        {
            new() { AccountId = AccountA, AmountIdr = 100, Type = "INCOME",  Flow = "CR" },
            new() { AccountId = AccountA, AmountIdr = 200, Type = "expense", Flow = "DB" },
        };

        var grouped = BuildGrouped(transactions);

        Assert.Equal(100m, grouped[AccountA].TotalIn);
        Assert.Equal(200m, grouped[AccountA].TotalOut);
    }

    [Fact]
    public void BuildGrouped_NetPosition_CalculatedCorrectly()
    {
        var transactions = new List<Transaction>
        {
            new() { AccountId = AccountA, AmountIdr = 3_000_000, Type = "Income",  Flow = "CR" },
            new() { AccountId = AccountA, AmountIdr = 1_200_000, Type = "Expense", Flow = "DB" },
        };

        var grouped = BuildGrouped(transactions);
        var net = grouped[AccountA].TotalIn - grouped[AccountA].TotalOut;

        Assert.Equal(1_800_000m, net);
    }

    // ── Multi-account isolation ───────────────────────────────────────────────

    [Fact]
    public void BuildGrouped_MultipleAccounts_StatsIsolatedPerAccount()
    {
        var transactions = new List<Transaction>
        {
            new() { AccountId = AccountA, AmountIdr = 1_000, Type = "Expense", Flow = "DB" },
            new() { AccountId = AccountB, AmountIdr = 2_000, Type = "Expense", Flow = "DB" },
            new() { AccountId = AccountA, AmountIdr =   500, Type = "Income",  Flow = "CR" },
        };

        var grouped = BuildGrouped(transactions);

        Assert.Equal(2, grouped.Count);
        Assert.Equal(1_000m, grouped[AccountA].TotalOut);
        Assert.Equal(500m,   grouped[AccountA].TotalIn);
        Assert.Equal(2_000m, grouped[AccountB].TotalOut);
        Assert.Equal(0m,     grouped[AccountB].TotalIn);
        Assert.Equal(2,      grouped[AccountA].Count);
        Assert.Equal(1,      grouped[AccountB].Count);
    }

    [Fact]
    public void BuildGrouped_EmptyTransactionList_ReturnsEmptyDictionary()
    {
        var grouped = BuildGrouped(new List<Transaction>());
        Assert.Empty(grouped);
    }

    // ── Account summary projection ────────────────────────────────────────────

    [Fact]
    public void AccountSummary_AccountWithNoTransactions_ReturnsZeroStats()
    {
        // TryGetValue on missing key returns default tuple (0, 0, 0)
        var grouped = new Dictionary<Guid, (decimal TotalIn, decimal TotalOut, int Count)>();
        var account = new Account { Id = AccountA, Name = "BCA", Currency = "IDR" };

        grouped.TryGetValue(account.Id, out var stats);

        Assert.Equal(0m, stats.TotalIn);
        Assert.Equal(0m, stats.TotalOut);
        Assert.Equal(0,  stats.Count);
    }

    // ── Institution name resolution ───────────────────────────────────────────

    [Fact]
    public void InstitutionMap_ValidInstitutionId_ReturnsName()
    {
        var instMap = new Dictionary<Guid, string> { { InstitutionX, "BCA" } };
        var account = new Account { Id = AccountA, InstitutionId = InstitutionX };

        var name = account.InstitutionId.HasValue && instMap.TryGetValue(account.InstitutionId.Value, out var n)
            ? n : string.Empty;

        Assert.Equal("BCA", name);
    }

    [Fact]
    public void InstitutionMap_NullInstitutionId_ReturnsEmptyString()
    {
        var instMap = new Dictionary<Guid, string> { { InstitutionX, "BCA" } };
        var account = new Account { Id = AccountA, InstitutionId = null };

        var name = account.InstitutionId.HasValue && instMap.TryGetValue(account.InstitutionId.Value, out var n)
            ? n : string.Empty;

        Assert.Equal(string.Empty, name);
    }

    [Fact]
    public void InstitutionMap_InstitutionIdNotInMap_ReturnsEmptyString()
    {
        var instMap = new Dictionary<Guid, string>(); // institution record missing
        var account = new Account { Id = AccountA, InstitutionId = InstitutionX };

        var name = account.InstitutionId.HasValue && instMap.TryGetValue(account.InstitutionId.Value, out var n)
            ? n : string.Empty;

        Assert.Equal(string.Empty, name);
    }
}
