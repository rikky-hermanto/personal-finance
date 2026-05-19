using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Tests.Services;

/// <summary>
/// Tests for the in-memory filtering and deduplication logic inside
/// TransactionService.ResolveAliasesBatchAsync — the part that runs after
/// the single Supabase fetch returns all alias rows.
///
/// Mirrors the filtering pipeline exactly so Supabase is not needed.
/// Must stay in sync if TransactionService.ResolveAliasesBatchAsync changes.
/// </summary>
public class WalletAliasBatchResolutionTests
{
    private static readonly Guid BcaId       = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid JagoId      = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");
    private static readonly Guid WiseId      = Guid.Parse("cccccccc-0000-0000-0000-000000000003");
    private static readonly Guid NeoId       = Guid.Parse("dddddddd-0000-0000-0000-000000000004");
    private static readonly Guid OldJagoId   = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000099");

    // Mirrors the filtering pipeline from TransactionService.ResolveAliasesBatchAsync.
    private static Dictionary<string, Guid> FilterAliases(
        IEnumerable<WalletAccountAlias> allAliases,
        IEnumerable<string> walletTexts)
    {
        var texts = walletTexts
            .Select(w => w?.Trim() ?? string.Empty)
            .Where(w => !string.IsNullOrEmpty(w))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (texts.Count == 0)
            return new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);

        return allAliases
            .Where(a => texts.Contains(a.AliasText.Trim(), StringComparer.OrdinalIgnoreCase))
            .GroupBy(a => a.AliasText.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(a => a.CreatedAt).First().AccountId,
                StringComparer.OrdinalIgnoreCase);
    }

    private static WalletAccountAlias Alias(string text, Guid accountId, DateTime? createdAt = null) =>
        new() { AliasText = text, AccountId = accountId, CreatedAt = createdAt ?? DateTime.UtcNow };

    // ── Basic matching ─────────────────────────────────────────────────────────

    [Fact]
    public void FilterAliases_KnownWallet_ReturnsMatchedEntry()
    {
        var aliases = new[] { Alias("BCA", BcaId) };

        var result = FilterAliases(aliases, ["BCA"]);

        Assert.Single(result);
        Assert.Equal(BcaId, result["BCA"]);
    }

    [Fact]
    public void FilterAliases_WalletNotInTable_ExcludedFromResult()
    {
        var aliases = new[] { Alias("BCA", BcaId) };

        var result = FilterAliases(aliases, ["Mandiri"]);

        Assert.Empty(result);
    }

    [Fact]
    public void FilterAliases_EmptyAliasTable_ReturnsEmptyDict()
    {
        var result = FilterAliases([], ["BCA", "Wise"]);

        Assert.Empty(result);
    }

    // ── Case insensitivity ────────────────────────────────────────────────────

    [Fact]
    public void FilterAliases_WalletTextCaseInsensitive_Matches()
    {
        var aliases = new[] { Alias("BCA", BcaId) };

        var result = FilterAliases(aliases, ["bca"]);

        Assert.Single(result);
        Assert.Equal(BcaId, result["bca"]);
    }

    [Fact]
    public void FilterAliases_AliasTextCaseInsensitive_Matches()
    {
        var aliases = new[] { Alias("jago main pocket", JagoId) };

        var result = FilterAliases(aliases, ["Jago Main Pocket"]);

        Assert.Single(result);
        Assert.Equal(JagoId, result["Jago Main Pocket"]);
    }

    // ── Whitespace trimming ───────────────────────────────────────────────────

    [Fact]
    public void FilterAliases_AliasTextWithLeadingTrailingWhitespace_StillMatches()
    {
        var aliases = new[] { Alias("  BCA  ", BcaId) };

        var result = FilterAliases(aliases, ["BCA"]);

        Assert.Single(result);
        Assert.Equal(BcaId, result["BCA"]);
    }

    [Fact]
    public void FilterAliases_WalletTextWithWhitespace_StillMatches()
    {
        var aliases = new[] { Alias("BCA", BcaId) };

        var result = FilterAliases(aliases, ["  BCA  "]);

        Assert.Single(result);
    }

    // ── Deduplication ─────────────────────────────────────────────────────────

    [Fact]
    public void FilterAliases_DuplicateWalletTextsInInput_DeduplicatedBeforeQuery()
    {
        // Two "BCA" entries in input — result should have one key
        var aliases = new[] { Alias("BCA", BcaId) };

        var result = FilterAliases(aliases, ["BCA", "BCA", "bca"]);

        Assert.Single(result);
    }

    [Fact]
    public void FilterAliases_MultipleAliasRowsForSameText_PicksMostRecent()
    {
        var older = Alias("Jago Main Pocket", OldJagoId, new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        var newer = Alias("Jago Main Pocket", JagoId,    new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        var result = FilterAliases([older, newer], ["Jago Main Pocket"]);

        Assert.Equal(JagoId, result["Jago Main Pocket"]);
    }

    [Fact]
    public void FilterAliases_MultipleAliasRowsForSameText_OlderEntryNotReturned()
    {
        var older = Alias("Jago Main Pocket", OldJagoId, new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        var newer = Alias("Jago Main Pocket", JagoId,    new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        var result = FilterAliases([older, newer], ["Jago Main Pocket"]);

        Assert.NotEqual(OldJagoId, result["Jago Main Pocket"]);
    }

    // ── Mixed known / unknown ─────────────────────────────────────────────────

    [Fact]
    public void FilterAliases_MixedKnownAndUnknownWallets_OnlyKnownReturned()
    {
        var aliases = new[] { Alias("BCA", BcaId), Alias("Wise", WiseId) };

        var result = FilterAliases(aliases, ["BCA", "Mandiri", "Wise"]);

        Assert.Equal(2, result.Count);
        Assert.Equal(BcaId,  result["BCA"]);
        Assert.Equal(WiseId, result["Wise"]);
        Assert.False(result.ContainsKey("Mandiri"));
    }

    [Fact]
    public void FilterAliases_MultiBankUpload_AllKnownResolved()
    {
        var aliases = new[]
        {
            Alias("BCA",             BcaId),
            Alias("Jago Main Pocket", JagoId),
            Alias("NeoBank",          NeoId),
            Alias("Wise AUD",         WiseId),
        };
        var wallets = new[] { "BCA", "Jago Main Pocket", "NeoBank", "Wise AUD" };

        var result = FilterAliases(aliases, wallets);

        Assert.Equal(4, result.Count);
        Assert.Equal(BcaId,  result["BCA"]);
        Assert.Equal(JagoId, result["Jago Main Pocket"]);
        Assert.Equal(NeoId,  result["NeoBank"]);
        Assert.Equal(WiseId, result["Wise AUD"]);
    }

    // ── Alias table contains extra rows irrelevant to this upload ────────────

    [Fact]
    public void FilterAliases_AliasTableHasExtraRows_OnlyRequestedWalletsReturned()
    {
        // Alias table has 4 entries; upload only uses 1 wallet
        var aliases = new[]
        {
            Alias("BCA",  BcaId),
            Alias("Wise", WiseId),
            Alias("Jago Main Pocket", JagoId),
            Alias("NeoBank",          NeoId),
        };

        var result = FilterAliases(aliases, ["BCA"]);

        Assert.Single(result);
        Assert.Equal(BcaId, result["BCA"]);
    }

    // ── Result dictionary is case-insensitive ─────────────────────────────────

    [Fact]
    public void FilterAliases_ResultDict_CaseInsensitiveLookup()
    {
        var aliases = new[] { Alias("BCA", BcaId) };

        var result = FilterAliases(aliases, ["BCA"]);

        Assert.True(result.ContainsKey("bca"));
        Assert.True(result.ContainsKey("BCA"));
        Assert.True(result.ContainsKey("Bca"));
    }
}
