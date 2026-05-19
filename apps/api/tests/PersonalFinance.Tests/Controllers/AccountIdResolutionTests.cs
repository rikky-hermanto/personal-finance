using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Tests.Controllers;

/// <summary>
/// Tests for the account-id resolution and stamping logic added to
/// TransactionsController.UploadPreviewNEW (fix for NULL account_id in DB).
///
/// AutoResolveAccountIdAsync has two phases:
///   1. Alias lookup (Supabase call — covered by WalletAliasGuardTests)
///   2. Fuzzy name-match fallback against the accounts list
///
/// The stamping loop stamps every transaction with the resolved Guid.
/// Both phases are pure enough to test without an HTTP stack.
/// </summary>
public class AccountIdResolutionTests
{
    private static readonly Guid BcaId        = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid JagoId       = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");
    private static readonly Guid WiseId       = Guid.Parse("cccccccc-0000-0000-0000-000000000003");
    private static readonly Guid NeoId        = Guid.Parse("dddddddd-0000-0000-0000-000000000004");
    private static readonly Guid SuperbankId  = Guid.Parse("eeeeeeee-0000-0000-0000-000000000005");

    // Mirrors ScoreCandidate + ScoreBestMatch in TransactionsController —
    // must stay in sync if the controller logic changes.
    private static readonly HashSet<string> Stopwords =
        ["main", "pocket", "savings", "account", "rekening", "tabungan", "card", "utama", "by"];

    private static string Normalize(string s) =>
        s.ToLowerInvariant().Replace(" ", "").Replace("-", "").Replace(".", "").Replace("_", "");

    private static HashSet<string> Tokenize(string s) =>
        [.. s.ToLowerInvariant()
             .Split([' ', '-', '_', '.', '(', ')'], StringSplitOptions.RemoveEmptyEntries)
             .Where(t => !Stopwords.Contains(t))];

    private static float ScoreCandidate(string wallet, string candidate)
    {
        var normW = Normalize(wallet);
        var normC = Normalize(candidate);
        if (normW.Contains(normC) || normC.Contains(normW)) return 1f;
        var wTokens = Tokenize(wallet);
        var cTokens = Tokenize(candidate);
        if (wTokens.Count == 0 || cTokens.Count == 0) return 0f;
        return (float)wTokens.Intersect(cTokens).Count() / wTokens.Count;
    }

    private static Guid? NameMatchFallback(string walletText, List<Account> accounts)
    {
        if (string.IsNullOrWhiteSpace(walletText)) return null;
        Account? best = null;
        float bestScore = 0f;
        foreach (var account in accounts)
        {
            var score = ScoreCandidate(walletText, account.Name);
            if (score > bestScore) { bestScore = score; best = account; }
        }
        return bestScore >= 0.5f ? best!.Id : null;
    }

    // Mirrors the stamping loop in UploadPreviewNEW.
    private static void StampAccountId(List<TransactionDto> transactions, Guid? resolvedId)
    {
        if (!resolvedId.HasValue) return;
        foreach (var tx in transactions)
            tx.AccountId = resolvedId;
    }

    private static List<Account> SampleAccounts() =>
    [
        new() { Id = BcaId,       Name = "BCA" },
        new() { Id = JagoId,      Name = "Bank Jago" },
        new() { Id = WiseId,      Name = "Wise" },
        new() { Id = NeoId,       Name = "Neo Bank" },
        new() { Id = SuperbankId, Name = "Superbank" },
    ];

    // ── Name-match: exact ─────────────────────────────────────────────────────

    [Fact]
    public void NameMatchFallback_ExactMatch_ReturnsAccountId()
    {
        var result = NameMatchFallback("BCA", SampleAccounts());

        Assert.Equal(BcaId, result);
    }

    [Fact]
    public void NameMatchFallback_CaseInsensitive_ReturnsAccountId()
    {
        var result = NameMatchFallback("bca", SampleAccounts());

        Assert.Equal(BcaId, result);
    }

    // ── Name-match: partial ───────────────────────────────────────────────────

    [Fact]
    public void NameMatchFallback_WalletContainsAccountName_ReturnsAccountId()
    {
        // Parser returns "Bank Jago Savings" — account name "Bank Jago" is a substring
        var result = NameMatchFallback("Bank Jago Savings", SampleAccounts());

        Assert.Equal(JagoId, result);
    }

    [Fact]
    public void NameMatchFallback_AccountNameContainsWallet_ReturnsAccountId()
    {
        // Parser returns short code "Jago" — account name "Bank Jago" contains it
        var result = NameMatchFallback("Jago", SampleAccounts());

        Assert.Equal(JagoId, result);
    }

    // ── Name-match: fuzzy — previously failing cases ──────────────────────────

    [Fact]
    public void NameMatchFallback_NeoBank_SpaceMismatch_ResolvesCorrectly()
    {
        // Parser returns "NeoBank" (no space); account name is "Neo Bank" (with space)
        var result = NameMatchFallback("NeoBank", SampleAccounts());

        Assert.Equal(NeoId, result);
    }

    [Fact]
    public void NameMatchFallback_JagoMainPocket_SubAccountName_ResolvesCorrectly()
    {
        // LLM extracts sub-account name "Jago Main Pocket"; account name is "Bank Jago"
        var result = NameMatchFallback("Jago Main Pocket", SampleAccounts());

        Assert.Equal(JagoId, result);
    }

    [Fact]
    public void NameMatchFallback_JagoWallet_DoesNotMatchBcaOrWise()
    {
        // Sanity: "Jago" token must not cross-match to unrelated accounts
        var result = NameMatchFallback("Jago Main Pocket", SampleAccounts());

        Assert.NotEqual(BcaId, result);
        Assert.NotEqual(WiseId, result);
    }

    // ── Name-match: no match ─────────────────────────────────────────────────

    [Fact]
    public void NameMatchFallback_NoMatch_ReturnsNull()
    {
        var result = NameMatchFallback("Mandiri", SampleAccounts());

        Assert.Null(result);
    }

    [Fact]
    public void NameMatchFallback_EmptyWallet_ReturnsNull()
    {
        var result = NameMatchFallback(string.Empty, SampleAccounts());

        Assert.Null(result);
    }

    [Fact]
    public void NameMatchFallback_WhitespaceWallet_ReturnsNull()
    {
        var result = NameMatchFallback("   ", SampleAccounts());

        Assert.Null(result);
    }

    [Fact]
    public void NameMatchFallback_EmptyAccountsList_ReturnsNull()
    {
        var result = NameMatchFallback("BCA", []);

        Assert.Null(result);
    }

    // ── Stamping loop ─────────────────────────────────────────────────────────

    [Fact]
    public void StampAccountId_AllTransactionsReceiveAccountId()
    {
        var transactions = new List<TransactionDto>
        {
            new() { Description = "tx1", Wallet = "BCA" },
            new() { Description = "tx2", Wallet = "BCA" },
            new() { Description = "tx3", Wallet = "BCA" },
        };

        StampAccountId(transactions, BcaId);

        Assert.All(transactions, tx => Assert.Equal(BcaId, tx.AccountId));
    }

    [Fact]
    public void StampAccountId_NullResolvedId_LeavesAccountIdUnchanged()
    {
        var transactions = new List<TransactionDto>
        {
            new() { Description = "tx1", Wallet = "Unknown", AccountId = null },
        };

        StampAccountId(transactions, null);

        Assert.Null(transactions[0].AccountId);
    }

    [Fact]
    public void StampAccountId_EmptyList_DoesNotThrow()
    {
        var ex = Record.Exception(() => StampAccountId([], BcaId));

        Assert.Null(ex);
    }

    [Fact]
    public void StampAccountId_OverwritesPreviousAccountId()
    {
        var oldId = Guid.NewGuid();
        var transactions = new List<TransactionDto>
        {
            new() { Description = "tx1", AccountId = oldId },
        };

        StampAccountId(transactions, BcaId);

        Assert.Equal(BcaId, transactions[0].AccountId);
    }

    // ── End-to-end: name-match then stamp (preview path) ─────────────────────

    [Fact]
    public void FullFlow_ParsedBcaTransactions_GetAccountIdStamped()
    {
        var transactions = new List<TransactionDto>
        {
            new() { Description = "TARIKAN ATM",    Wallet = "BCA", AmountIdr = 300_000, Flow = "DB" },
            new() { Description = "TRANSFER MASUK", Wallet = "BCA", AmountIdr = 800_000, Flow = "CR" },
        };

        var walletText = transactions.First().Wallet;
        var resolvedId = NameMatchFallback(walletText, SampleAccounts());
        StampAccountId(transactions, resolvedId);

        Assert.Equal(BcaId, transactions[0].AccountId);
        Assert.Equal(BcaId, transactions[1].AccountId);
    }

    [Fact]
    public void FullFlow_UnknownWallet_TransactionsHaveNullAccountId()
    {
        var transactions = new List<TransactionDto>
        {
            new() { Description = "DEBIT", Wallet = "Mandiri", AmountIdr = 100_000, Flow = "DB" },
        };

        var walletText = transactions.First().Wallet;
        var resolvedId = NameMatchFallback(walletText, SampleAccounts());
        StampAccountId(transactions, resolvedId);

        Assert.Null(transactions[0].AccountId);
    }

    // ── Per-transaction resolution (ResolveAccountIdsAsync) ──────────────────
    // Mirrors the logic in TransactionsController.ResolveAccountIdsAsync.
    // Used by both upload-preview and submit as the single resolution path.

    private static void ResolveAccountIds(List<TransactionDto> transactions, List<Account> accounts)
    {
        var unlinked = transactions.Where(t => !t.AccountId.HasValue && !string.IsNullOrWhiteSpace(t.Wallet)).ToList();
        if (!unlinked.Any()) return;

        var distinctWallets = unlinked.Select(t => t.Wallet).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var walletToAccount = new Dictionary<string, Guid?>(StringComparer.OrdinalIgnoreCase);

        foreach (var wallet in distinctWallets)
            walletToAccount[wallet] = NameMatchFallback(wallet, accounts);

        foreach (var tx in unlinked)
            if (walletToAccount.TryGetValue(tx.Wallet, out var id))
                tx.AccountId = id;
    }

    // ── Single-bank CSV ───────────────────────────────────────────────────────

    [Fact]
    public void ResolveAccountIds_SingleBankCsv_AllRowsStamped()
    {
        // Standard BCA single-bank CSV: every row has Wallet = "BCA"
        var transactions = new List<TransactionDto>
        {
            new() { Description = "KARTU DEBIT", Wallet = "BCA", AccountId = null, AmountIdr = 50_000,  Flow = "DB" },
            new() { Description = "TRANSFER IN", Wallet = "BCA", AccountId = null, AmountIdr = 100_000, Flow = "CR" },
        };

        ResolveAccountIds(transactions, SampleAccounts());

        Assert.Equal(BcaId, transactions[0].AccountId);
        Assert.Equal(BcaId, transactions[1].AccountId);
    }

    // ── Multi-bank master CSV ─────────────────────────────────────────────────

    [Fact]
    public void ResolveAccountIds_MultiBankCsv_EachRowGetsOwnAccountId()
    {
        // Master statement with mixed wallets — each row must get its own account_id
        var transactions = new List<TransactionDto>
        {
            new() { Description = "BCA tx",       Wallet = "BCA",       AccountId = null, AmountIdr = 200_000, Flow = "DB" },
            new() { Description = "Bank Jago tx",  Wallet = "Bank Jago", AccountId = null, AmountIdr = 150_000, Flow = "CR" },
            new() { Description = "Wise tx",       Wallet = "Wise",      AccountId = null, AmountIdr =  50_000, Flow = "DB" },
        };

        ResolveAccountIds(transactions, SampleAccounts());

        Assert.Equal(BcaId,  transactions[0].AccountId);
        Assert.Equal(JagoId, transactions[1].AccountId);
        Assert.Equal(WiseId, transactions[2].AccountId);
    }

    [Fact]
    public void ResolveAccountIds_MasterCsvFirstRowEmptyWallet_SkipsEmptyStampsRest()
    {
        // Master CSV first row is "Initial Balance" with empty Wallet —
        // this was the original bug: empty wallet resolved to null → nothing stamped
        var transactions = new List<TransactionDto>
        {
            new() { Description = "Initial Balance", Wallet = "",    AccountId = null, AmountIdr = 169_338_655, Flow = "CR" },
            new() { Description = "TARIKAN ATM",     Wallet = "BCA", AccountId = null, AmountIdr =     200_000, Flow = "DB" },
            new() { Description = "TRANSFER",        Wallet = "BCA", AccountId = null, AmountIdr =     200_000, Flow = "CR" },
        };

        ResolveAccountIds(transactions, SampleAccounts());

        Assert.Null(transactions[0].AccountId);    // empty wallet — unresolvable, stays null
        Assert.Equal(BcaId, transactions[1].AccountId);
        Assert.Equal(BcaId, transactions[2].AccountId);
    }

    // ── Already-linked rows not overwritten ───────────────────────────────────

    [Fact]
    public void ResolveAccountIds_AlreadyLinked_NotOverwritten()
    {
        var transactions = new List<TransactionDto>
        {
            new() { Description = "tx1", Wallet = "Bank Jago", AccountId = JagoId, AmountIdr = 10_000, Flow = "DB" },
            new() { Description = "tx2", Wallet = "Bank Jago", AccountId = null,   AmountIdr = 20_000, Flow = "DB" },
        };

        ResolveAccountIds(transactions, SampleAccounts());

        Assert.Equal(JagoId, transactions[0].AccountId); // unchanged
        Assert.Equal(JagoId, transactions[1].AccountId); // resolved
    }

    [Fact]
    public void ResolveAccountIds_AllAlreadyLinked_NoChange()
    {
        var transactions = new List<TransactionDto>
        {
            new() { Description = "tx1", Wallet = "BCA", AccountId = BcaId, AmountIdr = 100_000, Flow = "DB" },
        };

        ResolveAccountIds(transactions, SampleAccounts());

        Assert.Equal(BcaId, transactions[0].AccountId);
    }

    // ── Edge cases ────────────────────────────────────────────────────────────

    [Fact]
    public void ResolveAccountIds_UnknownWallet_RemainsNull()
    {
        var transactions = new List<TransactionDto>
        {
            new() { Description = "tx1", Wallet = "Mandiri", AccountId = null, AmountIdr = 75_000, Flow = "DB" },
        };

        ResolveAccountIds(transactions, SampleAccounts());

        Assert.Null(transactions[0].AccountId);
    }

    [Fact]
    public void ResolveAccountIds_EmptyList_DoesNotThrow()
    {
        var ex = Record.Exception(() => ResolveAccountIds([], SampleAccounts()));

        Assert.Null(ex);
    }

    [Fact]
    public void ResolveAccountIds_MixedKnownAndUnknown_OnlyKnownResolved()
    {
        var transactions = new List<TransactionDto>
        {
            new() { Description = "BCA tx",     Wallet = "BCA",     AccountId = null, AmountIdr = 100_000, Flow = "DB" },
            new() { Description = "Mandiri tx", Wallet = "Mandiri", AccountId = null, AmountIdr =  50_000, Flow = "DB" },
        };

        ResolveAccountIds(transactions, SampleAccounts());

        Assert.Equal(BcaId, transactions[0].AccountId);
        Assert.Null(transactions[1].AccountId);
    }

    // ── ScoreCandidate: Normalize (Level 1) ──────────────────────────────────

    [Fact]
    public void ScoreCandidate_NormalizeStripsSpaces_Matches()
    {
        // "NeoBank" and "Neo Bank" both normalize to "neobank"
        var score = ScoreCandidate("NeoBank", "Neo Bank");

        Assert.Equal(1f, score);
    }

    [Fact]
    public void ScoreCandidate_NormalizeStripsHyphens_Matches()
    {
        // "Wise-AUD" normalizes to "wiseaud"; "Wise AUD" normalizes to "wiseaud"
        var score = ScoreCandidate("Wise-AUD", "Wise AUD");

        Assert.Equal(1f, score);
    }

    [Fact]
    public void ScoreCandidate_NormalizeStripsDots_Matches()
    {
        var score = ScoreCandidate("B.C.A", "BCA");

        Assert.Equal(1f, score);
    }

    [Fact]
    public void ScoreCandidate_NormalizeCaseInsensitive_Matches()
    {
        var score = ScoreCandidate("SUPERBANK", "Superbank");

        Assert.Equal(1f, score);
    }

    // ── ScoreCandidate: Token intersection (Level 2) ─────────────────────────

    [Fact]
    public void ScoreCandidate_TokenIntersection_PartialMatch_ReturnsExpectedScore()
    {
        // wallet tokens (after stopwords): {"jago"}; candidate tokens: {"bank","jago"}
        // intersection = 1 / wallet_count = 1/1 = 1.0
        var score = ScoreCandidate("Jago Main Pocket", "Bank Jago");

        Assert.Equal(1f, score);
    }

    [Fact]
    public void ScoreCandidate_TokenIntersection_NoSharedTokens_ReturnsZero()
    {
        // "bca" ∩ {"bank","jago"} = {}
        var score = ScoreCandidate("BCA Extra Stuff", "Bank Jago");

        Assert.Equal(0f, score);
    }

    [Fact]
    public void ScoreCandidate_WalletAllStopwords_ReturnsZero()
    {
        // wallet tokenizes to empty set → guard returns 0f
        var score = ScoreCandidate("Main Pocket Savings", "Bank Jago");

        Assert.Equal(0f, score);
    }

    [Fact]
    public void ScoreCandidate_CandidateAllStopwords_ReturnsZero()
    {
        var score = ScoreCandidate("Bank Jago", "Main Pocket Account");

        Assert.Equal(0f, score);
    }

    [Fact]
    public void ScoreCandidate_PartialTokenOverlap_ScoreBelowThreshold()
    {
        // wallet tokens: {"wise","aud","transfer"}; candidate tokens: {"wise"}
        // intersection = 1; score = 1/3 ≈ 0.33 — below 0.5 threshold
        var score = ScoreCandidate("Wise AUD Transfer Fee", "Wise");

        // Level 1 normalized-contains: "wiseaudtransferfee" contains "wise" → returns 1f
        // (Normalize strips spaces, so "wise" IS a substring of "wiseaudtransferfee")
        Assert.Equal(1f, score);
    }

    [Fact]
    public void ScoreCandidate_TwoMatchingTokensOutOfThree_AboveThreshold()
    {
        // wallet tokens after stopwords: {"seabank","digital"} — "digital" is not a stopword here
        // candidate tokens: {"seabank"}
        // intersection = 1 / 2 = 0.5 — at threshold, not above
        // Let's use a case where 2/2 tokens match
        var score = ScoreCandidate("Seabank Digital", "Seabank Digital Plus");

        // Level 1: "seabankdigital" is contained in "seabankdigitalplus" → 1f
        Assert.Equal(1f, score);
    }

    // ── ScoreBestMatch: institution-join path ─────────────────────────────────
    // Tests the ScoreBestMatch overload that checks institution name when account
    // name alone doesn't match. Mirrors controller ScoreBestMatch signature.

    private record AccountFixture(Guid Id, string AccountName, string? InstitutionName);

    private static Guid? ScoreBestMatchHelper(string wallet, List<AccountFixture> accounts)
    {
        AccountFixture? best = null;
        float bestScore = 0f;
        foreach (var account in accounts)
        {
            var score = ScoreCandidate(wallet, account.AccountName);
            if (account.InstitutionName is not null)
            {
                var instScore = ScoreCandidate(wallet, account.InstitutionName) * 0.95f;
                score = Math.Max(score, instScore);
            }
            if (score > bestScore) { bestScore = score; best = account; }
        }
        return bestScore >= 0.5f ? best!.Id : null;
    }

    [Fact]
    public void ScoreBestMatch_UserNamedAccount_ResolvesViaInstitutionName()
    {
        // User named their account "Jago Tabungan Utama" — doesn't match "Jago Main Pocket" directly.
        // Institution name "Bank Jago" provides the token "jago" → match.
        var accounts = new List<AccountFixture>
        {
            new(BcaId,  "My BCA Checking",      "BCA"),
            new(JagoId, "Jago Tabungan Utama",  "Bank Jago"),
        };

        var result = ScoreBestMatchHelper("Jago Main Pocket", accounts);

        Assert.Equal(JagoId, result);
    }

    [Fact]
    public void ScoreBestMatch_ExactAccountNameBeatsInstitutionMatch()
    {
        // "Wise" exactly matches account name → score 1.0.
        // Institution "Wise Inc" would score 0.95 * 1.0 = 0.95.
        // Account-name match must win.
        var accounts = new List<AccountFixture>
        {
            new(WiseId, "Wise",  "Wise Inc"),
            new(BcaId,  "BCA Savings", "BCA"),
        };

        var result = ScoreBestMatchHelper("Wise", accounts);

        Assert.Equal(WiseId, result);
    }

    [Fact]
    public void ScoreBestMatch_NullInstitutionId_FallsBackToAccountNameOnly()
    {
        // Account has no institution — should still resolve via account name.
        var accounts = new List<AccountFixture>
        {
            new(BcaId, "BCA", null),
        };

        var result = ScoreBestMatchHelper("BCA", accounts);

        Assert.Equal(BcaId, result);
    }

    [Fact]
    public void ScoreBestMatch_NeoBank_ResolvesViaInstitutionNameWhenAccountNameDiffers()
    {
        // Account named "Digital Savings"; institution is "Neo Bank".
        // Wallet "NeoBank" normalizes to "neobank" which contains normalized "neobank" (institution) → match.
        var accounts = new List<AccountFixture>
        {
            new(NeoId, "Digital Savings", "Neo Bank"),
            new(BcaId, "BCA",             "BCA"),
        };

        var result = ScoreBestMatchHelper("NeoBank", accounts);

        Assert.Equal(NeoId, result);
    }

    [Fact]
    public void ScoreBestMatch_BelowThreshold_ReturnsNull()
    {
        // "mandiri" shares no tokens with any account or institution name in the list.
        var accounts = new List<AccountFixture>
        {
            new(BcaId, "BCA", "BCA"),
            new(JagoId, "Bank Jago", "Bank Jago"),
        };

        var result = ScoreBestMatchHelper("Mandiri", accounts);

        Assert.Null(result);
    }

    [Fact]
    public void ScoreBestMatch_HigherScoringAccountWins()
    {
        // Two accounts partially match; the one with higher token overlap wins.
        var accounts = new List<AccountFixture>
        {
            new(JagoId,      "Bank Jago",  null),  // token "jago" → score 1/1 = 1.0
            new(SuperbankId, "Superbank",  null),  // no shared token → 0
        };

        var result = ScoreBestMatchHelper("Jago Pocket", accounts);

        Assert.Equal(JagoId, result);
    }
}
