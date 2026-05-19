using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Services;

/// <summary>
/// Unit tests for TransactionService.TagDuplicatesLogic.
///
/// The dedup key is: date|amount|description|accountId|flow
/// The tie-breaker is BankRunningBalance (BRB):
///   - Both have BRB → compare values; equal = duplicate
///   - Either is null → assume match = duplicate (safest default for unknown origin)
///
/// Root-cause regression being protected:
///   The frontend TransactionDto interface was missing the bankRunningBalance field,
///   so BRB was stripped from every row during the preview→submit round-trip.
///   With null BRB on all incoming rows, IsMatch always returned true, causing same-key
///   rows (e.g. two NeoBank FEE 2500 charges on the same day) to be incorrectly collapsed
///   to one. Fix: add bankRunningBalance to the TS interface so the value survives the round-trip.
/// </summary>
public class DeduplicationTests
{
    private static readonly Guid NeoBankId  = Guid.Parse("3474b203-ceef-4134-91be-a105e79acd21");
    private static readonly Guid BcaId      = Guid.Parse("17d36b26-e3dc-4e3d-ba66-aeabf9a58bf5");

    // ── BankRunningBalance as tie-breaker ─────────────────────────────────────

    [Fact]
    public void TagDuplicatesLogic_SameKey_DifferentBrb_NotDuplicate()
    {
        // Scenario: NeoBank charges a 2500 FEE twice on the same day.
        // Each charge has a different BankRunningBalance, so they are distinct transactions.
        // The bug: without BRB on the incoming side, the second FEE was always dropped.
        var incoming = new List<TransactionDto>
        {
            Fee(1, Utc(2024, 6, 28), bankRunningBalance: 164_838_655.95m),  // first FEE
            Fee(2, Utc(2024, 6, 28), bankRunningBalance: 164_836_155.95m),  // second FEE
        };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing: []);

        Assert.False(result[0].IsDuplicate, "first FEE should not be a duplicate");
        Assert.False(result[1].IsDuplicate, "second FEE has different BRB — must not be treated as duplicate");
    }

    [Fact]
    public void TagDuplicatesLogic_SameKey_SameBrb_IsDuplicate()
    {
        // The same transaction submitted twice in the same batch (exact BRB match) → duplicate.
        var incoming = new List<TransactionDto>
        {
            Fee(1, Utc(2024, 6, 28), bankRunningBalance: 164_838_655.95m),
            Fee(2, Utc(2024, 6, 28), bankRunningBalance: 164_838_655.95m), // identical
        };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing: []);

        Assert.False(result[0].IsDuplicate);
        Assert.True(result[1].IsDuplicate, "exact BRB match in same batch → duplicate");
    }

    [Fact]
    public void TagDuplicatesLogic_SameKey_BothBrbNull_IsDuplicate()
    {
        // Both sides have null BRB — cannot distinguish, so safest outcome is duplicate.
        // This is the pre-fix behaviour (frontend stripping BRB).
        var incoming = new List<TransactionDto>
        {
            Fee(1, Utc(2024, 6, 28), bankRunningBalance: null),
            Fee(2, Utc(2024, 6, 28), bankRunningBalance: null),
        };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing: []);

        Assert.False(result[0].IsDuplicate);
        Assert.True(result[1].IsDuplicate, "null BRB on both sides → treated as duplicate (safe default)");
    }

    // ── Incoming vs existing DB rows ─────────────────────────────────────────

    [Fact]
    public void TagDuplicatesLogic_IncomingBrbNull_ExistingHasBrb_IsDuplicate()
    {
        // Incoming has no BRB (e.g. pre-fix round-trip) but DB row matches the key.
        // null incoming BRB → IsMatch returns true → duplicate.
        var existing = new List<Transaction> { DbFee(Utc(2024, 6, 28), brb: 164_838_655.95m) };
        var incoming = new List<TransactionDto> { Fee(1, Utc(2024, 6, 28), bankRunningBalance: null) };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing);

        Assert.True(result[0].IsDuplicate, "incoming with null BRB is treated as duplicate when key matches DB");
    }

    [Fact]
    public void TagDuplicatesLogic_IncomingBrbSet_ExistingBrbNull_IsDuplicate()
    {
        // DB row has no BRB stored but key matches → duplicate (safe default).
        var existing = new List<Transaction> { DbFee(Utc(2024, 6, 28), brb: null) };
        var incoming = new List<TransactionDto> { Fee(1, Utc(2024, 6, 28), bankRunningBalance: 164_838_655.95m) };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing);

        Assert.True(result[0].IsDuplicate, "DB row with null BRB → treated as duplicate when key matches");
    }

    [Fact]
    public void TagDuplicatesLogic_IncomingBrbSet_ExistingBrbDifferent_NotDuplicate()
    {
        // DB already has one FEE with a different BRB — incoming is a second distinct charge.
        var existing = new List<Transaction> { DbFee(Utc(2024, 6, 28), brb: 164_838_655.95m) };
        var incoming = new List<TransactionDto> { Fee(1, Utc(2024, 6, 28), bankRunningBalance: 164_836_155.95m) };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing);

        Assert.False(result[0].IsDuplicate, "different BRB from DB → distinct transaction, not duplicate");
    }

    [Fact]
    public void TagDuplicatesLogic_IncomingBrbSet_ExistingBrbEqual_IsDuplicate()
    {
        // Exact BRB match between incoming and DB → same transaction re-uploaded.
        var existing = new List<Transaction> { DbFee(Utc(2024, 6, 28), brb: 164_838_655.95m) };
        var incoming = new List<TransactionDto> { Fee(1, Utc(2024, 6, 28), bankRunningBalance: 164_838_655.95m) };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing);

        Assert.True(result[0].IsDuplicate, "matching BRB → same row re-uploaded → duplicate");
    }

    // ── BRB tolerance (0.01 threshold) ───────────────────────────────────────

    [Fact]
    public void TagDuplicatesLogic_BrbWithinTolerance_IsDuplicate()
    {
        // Floating-point rounding can produce tiny differences; values within 0.01 are the same row.
        var existing = new List<Transaction> { DbFee(Utc(2024, 6, 28), brb: 164_838_655.95m) };
        var incoming = new List<TransactionDto> { Fee(1, Utc(2024, 6, 28), bankRunningBalance: 164_838_655.954m) };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing);

        Assert.True(result[0].IsDuplicate, "BRB difference < 0.01 is within tolerance → duplicate");
    }

    [Fact]
    public void TagDuplicatesLogic_BrbJustOutsideTolerance_NotDuplicate()
    {
        // A difference >= 0.01 is treated as a distinct transaction.
        var existing = new List<Transaction> { DbFee(Utc(2024, 6, 28), brb: 164_838_655.95m) };
        var incoming = new List<TransactionDto> { Fee(1, Utc(2024, 6, 28), bankRunningBalance: 164_838_655.94m) };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing);

        Assert.False(result[0].IsDuplicate, "BRB difference of 0.01 is outside tolerance → not duplicate");
    }

    // ── Key matching ─────────────────────────────────────────────────────────

    [Fact]
    public void TagDuplicatesLogic_DifferentAccount_NotDuplicate()
    {
        // Same date+amount+description+flow but different accountId → different bank → not duplicate.
        var existing = new List<Transaction> { DbFee(Utc(2024, 6, 28), brb: null, accountId: BcaId) };
        var incoming = new List<TransactionDto> { Fee(1, Utc(2024, 6, 28), bankRunningBalance: null, accountId: NeoBankId) };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing);

        Assert.False(result[0].IsDuplicate, "different accountId → different bank → not duplicate");
    }

    [Fact]
    public void TagDuplicatesLogic_DifferentDate_NotDuplicate()
    {
        // Same charge on a different day is a new transaction.
        var existing = new List<Transaction> { DbFee(Utc(2024, 6, 28), brb: null) };
        var incoming = new List<TransactionDto> { Fee(1, Utc(2024, 6, 29), bankRunningBalance: null) };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing);

        Assert.False(result[0].IsDuplicate, "different date → different transaction");
    }

    [Fact]
    public void TagDuplicatesLogic_DifferentAmount_NotDuplicate()
    {
        var existing = new List<Transaction> { DbFee(Utc(2024, 6, 28), brb: null) };
        var incoming = new List<TransactionDto>
        {
            new() { Id = 1, Date = Utc(2024, 6, 28), AmountIdr = 5_000m, Flow = "DB",
                    AccountId = NeoBankId, Description = "FEE", BankRunningBalance = null }
        };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing);

        Assert.False(result[0].IsDuplicate, "different amount → different transaction");
    }

    // ── Multi-row batch — real NeoBank FEE scenario ───────────────────────────

    [Fact]
    public void TagDuplicatesLogic_ThreeFeesInBatch_TwoAlreadyInDb_OnlyNewOneAdded()
    {
        // DB has 2 FEE rows from last month's import.
        // This month we upload 3 FEEs — 2 are re-uploads of existing rows, 1 is new.
        var existing = new List<Transaction>
        {
            DbFee(Utc(2024, 6, 28), brb: 164_841_155.95m),  // oldest — already stored
            DbFee(Utc(2024, 6, 28), brb: 164_838_655.95m),  // second — already stored
        };
        var incoming = new List<TransactionDto>
        {
            Fee(1, Utc(2024, 6, 28), bankRunningBalance: 164_841_155.95m),  // matches existing[0]
            Fee(2, Utc(2024, 6, 28), bankRunningBalance: 164_838_655.95m),  // matches existing[1]
            Fee(3, Utc(2024, 6, 28), bankRunningBalance: 164_836_155.95m),  // new — not in DB
        };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing);

        Assert.True(result[0].IsDuplicate,  "first FEE is already in DB");
        Assert.True(result[1].IsDuplicate,  "second FEE is already in DB");
        Assert.False(result[2].IsDuplicate, "third FEE is new — must be imported");
    }

    [Fact]
    public void TagDuplicatesLogic_SameDayAtmWithdrawals_TwoDistinctOccurrences_BothImported()
    {
        // BCA ATM withdrawal 200,000 DB twice on the same day — each has a unique BRB.
        // This is a real pattern from the master CSV (2024-03-16, 2024-04-28, etc.).
        var incoming = new List<TransactionDto>
        {
            Atm(1, Utc(2024, 3, 16), bankRunningBalance: 155_000_000m),
            Atm(2, Utc(2024, 3, 16), bankRunningBalance: 154_800_000m),
        };

        var result = TransactionService.TagDuplicatesLogic(incoming, existing: []);

        Assert.False(result[0].IsDuplicate, "first ATM withdrawal is not a duplicate");
        Assert.False(result[1].IsDuplicate, "second ATM withdrawal on same day must survive when BRB differs");
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static TransactionDto Fee(int id, DateTime date, decimal? bankRunningBalance, Guid? accountId = null) =>
        new()
        {
            Id                 = id,
            Date               = date,
            Description        = "FEE",
            Flow               = "DB",
            AmountIdr          = 2_500m,
            AccountId          = accountId ?? NeoBankId,
            BankRunningBalance = bankRunningBalance,
        };

    private static TransactionDto Atm(int id, DateTime date, decimal? bankRunningBalance) =>
        new()
        {
            Id                 = id,
            Date               = date,
            Description        = "TARIKAN ATM",
            Flow               = "DB",
            AmountIdr          = 200_000m,
            AccountId          = BcaId,
            BankRunningBalance = bankRunningBalance,
        };

    private static Transaction DbFee(DateTime date, decimal? brb, Guid? accountId = null) =>
        new()
        {
            Date               = date,
            Description        = "FEE",
            Flow               = "DB",
            AmountIdr          = 2_500m,
            AccountId          = accountId ?? NeoBankId,
            BankRunningBalance = brb,
        };

    private static DateTime Utc(int year, int month, int day) =>
        new(year, month, day, 0, 0, 0, DateTimeKind.Utc);
}
