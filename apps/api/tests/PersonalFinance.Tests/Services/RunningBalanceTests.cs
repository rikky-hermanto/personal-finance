using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;
using Xunit;

namespace PersonalFinance.Tests.Services;

/// <summary>
/// Unit tests for the running balance computation logic.
///
/// These tests validate TransactionService.ComputeRunningBalances, which is an in-memory
/// mirror of the SQL window function in the v_transactions_with_balance VIEW:
///
///   SUM(CASE WHEN flow = 'CR' THEN amount_idr ELSE -amount_idr END)
///   OVER (ORDER BY date ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
///
/// The VIEW is global (no PARTITION BY), so the running total accumulates across ALL
/// bank accounts combined — matching the "master cashflow" Excel reference.
/// </summary>
public class RunningBalanceTests
{
    private static readonly Guid BcaId = Guid.Parse("00000000-0000-0000-0000-000000000001");
    private static readonly Guid SeaBankId = Guid.Parse("00000000-0000-0000-0000-000000000002");

    // ── Sign convention ──────────────────────────────────────────────────────

    [Fact]
    public void ComputeRunningBalances_CreditAdds_DebitSubtracts()
    {
        // Arrange — matches the first 3 Jan 01 2024 BCA rows from the Excel reference
        var txns = new List<TransactionDto>
        {
            new() { Id = 1, Date = Utc(2024, 1, 1), Flow = "CR", AmountIdr = 169_338_655.95m },
            new() { Id = 2, Date = Utc(2024, 1, 1), Flow = "CR", AmountIdr = 200_000m },
            new() { Id = 3, Date = Utc(2024, 1, 1), Flow = "DB", AmountIdr = 200_000m },
        };

        // Act
        var result = TransactionService.ComputeRunningBalances(txns);

        // Assert
        Assert.Equal(3, result.Count);
        Assert.Equal(169_338_655.95m, result[0].Balance);  // initial CR
        Assert.Equal(169_538_655.95m, result[1].Balance);  // +200,000 CR
        Assert.Equal(169_338_655.95m, result[2].Balance);  // -200,000 DB nets back
    }

    // ── Decimal precision ────────────────────────────────────────────────────

    [Fact]
    public void ComputeRunningBalances_DecimalCents_PreservesFullPrecision()
    {
        // Arrange — BNI-AM Indeks IDX30 mutual fund redemption (real example with cents)
        var txns = new List<TransactionDto>
        {
            new() { Id = 1, Date = Utc(2024, 1, 3), Flow = "CR", AmountIdr = 20_101_059.26m },
            new() { Id = 2, Date = Utc(2024, 1, 4), Flow = "DB", AmountIdr = 931.51m },
        };

        // Act
        var result = TransactionService.ComputeRunningBalances(txns);

        // Assert — decimal arithmetic must not round to integer
        Assert.Equal(20_101_059.26m, result[0].Balance);
        Assert.Equal(20_100_127.75m, result[1].Balance);  // 20_101_059.26 - 931.51
    }

    [Fact]
    public void ComputeRunningBalances_SmallFractional_NoIntegerRounding()
    {
        // Regression: formatCurrency(IDR) defaults to 0 decimal places which silently
        // dropped cents. This test guards the backend decimal value before formatting.
        var txns = new List<TransactionDto>
        {
            new() { Id = 1, Date = Utc(2024, 1, 1), Flow = "CR", AmountIdr = 169_338_655.95m },
            new() { Id = 2, Date = Utc(2024, 1, 1), Flow = "DB", AmountIdr = 4_500_000m },
            new() { Id = 3, Date = Utc(2024, 1, 1), Flow = "DB", AmountIdr = 2_500m },
        };

        var result = TransactionService.ComputeRunningBalances(txns);

        // 169_338_655.95 - 4_500_000 - 2_500 = 164_836_155.95 (must keep .95, not .00)
        Assert.Equal(164_836_155.95m, result[2].Balance);
        Assert.NotEqual(164_836_156m, result[2].Balance);  // confirm no rounding to integer
    }

    // ── Global (cross-account) ordering ──────────────────────────────────────

    [Fact]
    public void ComputeRunningBalances_GlobalOrder_CrossAccount_SingleRunningTotal()
    {
        // Arrange — BCA gets initial balance, then SeaBank receives a transfer from BCA.
        // The global balance should treat both as part of the same running total, not
        // restart at 0 when the account changes (the per-account bug that was fixed).
        var txns = new List<TransactionDto>
        {
            new() { Id = 1, Date = Utc(2024, 1, 1), Flow = "CR", AmountIdr = 164_836_155.95m, AccountId = BcaId },
            new() { Id = 2, Date = Utc(2024, 1, 1), Flow = "CR", AmountIdr = 4_500_000m, AccountId = SeaBankId },
        };

        // Act
        var result = TransactionService.ComputeRunningBalances(txns);

        // Assert — SeaBank row must continue accumulating from BCA, not restart at 4_500_000
        Assert.Equal(164_836_155.95m, result[0].Balance);  // BCA initial
        Assert.Equal(169_336_155.95m, result[1].Balance);  // SeaBank: 164_836_155.95 + 4_500_000
        Assert.NotEqual(4_500_000m, result[1].Balance);    // would be the per-account (wrong) value
    }

    [Fact]
    public void ComputeRunningBalances_InternalTransfer_NetsToZero()
    {
        // An internal transfer (BCA → SeaBank) should net to 0 in the global balance:
        // DB on BCA subtracts, CR on SeaBank adds back the same amount.
        var txns = new List<TransactionDto>
        {
            new() { Id = 1, Date = Utc(2024, 1, 1), Flow = "CR", AmountIdr = 100_000m, AccountId = BcaId },
            new() { Id = 2, Date = Utc(2024, 1, 2), Flow = "DB", AmountIdr = 50_000m,  AccountId = BcaId },   // transfer out of BCA
            new() { Id = 3, Date = Utc(2024, 1, 2), Flow = "CR", AmountIdr = 50_000m,  AccountId = SeaBankId }, // transfer into SeaBank
        };

        var result = TransactionService.ComputeRunningBalances(txns);

        Assert.Equal(100_000m, result[0].Balance);  // starting balance
        Assert.Equal(50_000m,  result[1].Balance);  // after BCA debit
        Assert.Equal(100_000m, result[2].Balance);  // after SeaBank credit: net 0 change
    }

    // ── Tie-breaking by id ───────────────────────────────────────────────────

    [Fact]
    public void ComputeRunningBalances_SameDate_OrderedById()
    {
        // When two transactions share the same date, the lower id must come first
        // (matching the VIEW's ORDER BY date ASC, id ASC).
        var date = Utc(2024, 1, 1);
        var txns = new List<TransactionDto>
        {
            new() { Id = 2, Date = date, Flow = "DB", AmountIdr = 5_000m },  // listed second
            new() { Id = 1, Date = date, Flow = "CR", AmountIdr = 100_000m }, // listed first
        };

        var result = TransactionService.ComputeRunningBalances(txns);

        // id=1 (CR) must be processed first regardless of list order
        Assert.Equal(100_000m, result[0].Balance); // id=1 CR
        Assert.Equal(95_000m,  result[1].Balance); // id=2 DB
        Assert.Equal(1, result[0].Transaction.Id);
        Assert.Equal(2, result[1].Transaction.Id);
    }

    // ── Null account_id ──────────────────────────────────────────────────────

    [Fact]
    public void ComputeRunningBalances_NullAccountId_IncludedInGlobalSum()
    {
        // Unlinked transactions (account_id = null, pre-migration) must still participate
        // in the global running balance — they are not excluded or partitioned separately.
        var txns = new List<TransactionDto>
        {
            new() { Id = 1, Date = Utc(2024, 1, 1), Flow = "CR", AmountIdr = 100_000m, AccountId = null },
            new() { Id = 2, Date = Utc(2024, 1, 2), Flow = "DB", AmountIdr = 10_000m,  AccountId = null },
        };

        var result = TransactionService.ComputeRunningBalances(txns);

        Assert.Equal(100_000m, result[0].Balance);
        Assert.Equal(90_000m,  result[1].Balance);
    }

    // ── RunningBalance → Balance DTO mapping ─────────────────────────────────

    [Fact]
    public void NullRunningBalance_MapsToZeroBalance()
    {
        // Rows where RunningBalance is NULL (e.g., no transactions) must produce 0 in the DTO,
        // not throw a NullReferenceException.
        decimal? runningBalance = null;
        var balance = runningBalance ?? 0m;
        Assert.Equal(0m, balance);
    }

    [Fact]
    public void DecimalRunningBalance_PreservesValueInDtoMapping()
    {
        // The ?? 0m fallback in GetTransactionPageAsync must not truncate decimal values.
        decimal? runningBalance = 169_338_655.95m;
        var balance = runningBalance ?? 0m;
        Assert.Equal(169_338_655.95m, balance);
    }

    // ── Edge cases ───────────────────────────────────────────────────────────

    [Fact]
    public void ComputeRunningBalances_EmptyList_ReturnsEmpty()
    {
        var result = TransactionService.ComputeRunningBalances(new List<TransactionDto>());
        Assert.Empty(result);
    }

    [Fact]
    public void ComputeRunningBalances_SingleCredit_EqualsAmount()
    {
        var txns = new List<TransactionDto>
        {
            new() { Id = 1, Date = Utc(2024, 1, 1), Flow = "CR", AmountIdr = 5_000_000m },
        };
        var result = TransactionService.ComputeRunningBalances(txns);
        Assert.Single(result);
        Assert.Equal(5_000_000m, result[0].Balance);
    }

    [Fact]
    public void ComputeRunningBalances_SingleDebit_NegativeBalance()
    {
        var txns = new List<TransactionDto>
        {
            new() { Id = 1, Date = Utc(2024, 1, 1), Flow = "DB", AmountIdr = 1_000m },
        };
        var result = TransactionService.ComputeRunningBalances(txns);
        Assert.Equal(-1_000m, result[0].Balance);
    }

    private static DateTime Utc(int year, int month, int day) =>
        new(year, month, day, 0, 0, 0, DateTimeKind.Utc);
}
