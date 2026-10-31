using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Quests;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Quests;

public class QuestEngineTests
{
    private static readonly Guid UserId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly DateOnly Today = new(2026, 10, 25);

    private static IndicatorScoreDto Ind(string code, string level, decimal score, decimal? raw) =>
        new(code, level, score, raw, score >= 70m ? "achieved" : "in_progress", code, string.Empty);

    private static ScoringSnapshot Snapshot(
        IEnumerable<IndicatorScoreDto>? indicators = null,
        IReadOnlyList<SavingsAccountFact>? savings = null,
        IReadOnlyList<Transaction>? transactions = null,
        bool transactionsFailed = false) =>
        new(Today,
            transactionsFailed ? null : transactions ?? [],
            savings ?? [],
            [],
            null,
            true,
            (indicators ?? []).ToList());

    private static (QuestEngine Engine, FakeQuestStore Store) Create(bool anyTransaction = false)
    {
        var (engine, store, _) = CreateWithLedger(anyTransaction);
        return (engine, store);
    }

    private static (QuestEngine Engine, FakeQuestStore Store, FakeHarvestLedger Ledger) CreateWithLedger(
        bool anyTransaction = false)
    {
        var store = new FakeQuestStore { AnyTransaction = anyTransaction };
        var ledger = new FakeHarvestLedger();
        return (new QuestEngine(store, ledger, NullLogger<QuestEngine>.Instance), store, ledger);
    }

    private static Transaction Tx(int year, int month, int day, decimal amount, string flow, Guid? accountId) =>
        new()
        {
            Date = new DateTime(year, month, day),
            AmountIdr = amount,
            Flow = flow,
            Type = flow == "CR" ? "Income" : "Expense",
            Category = "Food",
            AccountId = accountId,
        };

    private static SavingsAccountFact Valued(DateTime when) => new(Guid.NewGuid(), "Savings", 1m, when);

    private static IndicatorScoreDto Cover(decimal months) =>
        Ind("liquid_savings_ratio", "L2", Math.Min(100m, months * 30m), months);

    [Fact]
    public async Task Evaluate_FirstUpload_CompletesMeetYourMoney()
    {
        // Arrange
        var (engine, store) = Create(anyTransaction: true);

        // Act
        await engine.EvaluateAsync(UserId, Snapshot());

        // Assert
        Assert.Contains(store.Completions, c => c.QuestCode == "l1.meet_your_money" && c.Rung == 0);
    }

    [Fact]
    public async Task Evaluate_TwiceOnSameSnapshot_StoresOneRowPerRung()
    {
        var (engine, store) = Create(anyTransaction: true);
        var snapshot = Snapshot([Cover(1.6m)], [Valued(new DateTime(2026, 10, 1))]);

        await engine.EvaluateAsync(UserId, snapshot);
        var count = store.Completions.Count;
        var second = await engine.EvaluateAsync(UserId, snapshot);

        Assert.Empty(second);
        Assert.Equal(count, store.Completions.Count);
    }

    [Fact]
    public async Task Evaluate_OnlyNewRungsAreInserted()
    {
        var (engine, store) = Create();
        var savings = new[] { Valued(new DateTime(2026, 10, 1)) };
        await engine.EvaluateAsync(UserId, Snapshot([Cover(1.1m)], savings));
        Assert.Equal([1, 2], store.Completions.Where(c => c.QuestCode == "l2.fence_posts").Select(c => (int)c.Rung).OrderBy(x => x));

        var fresh = await engine.EvaluateAsync(UserId, Snapshot([Cover(2.6m)], savings));

        Assert.Equal([3, 4, 5], fresh.Where(c => c.QuestCode == "l2.fence_posts").Select(c => (int)c.Rung).OrderBy(x => x));
    }

    [Fact]
    public async Task Evaluate_ScoreDropsLater_KeepsEarnedStarsAndDoesNotCelebrateAgain()
    {
        var (engine, store) = Create();
        await engine.EvaluateAsync(UserId, Snapshot([Ind("spend_lt_income", "L1", 100m, 0.7m)]));
        var stars = store.Completions.Count(c => c.QuestCode == "stars.spend_lt_income");
        Assert.Equal(3, stars);

        var later = await engine.EvaluateAsync(UserId, Snapshot([Ind("spend_lt_income", "L1", 40m, 1.1m)]));

        Assert.Empty(later);
        Assert.Equal(3, store.Completions.Count(c => c.QuestCode == "stars.spend_lt_income"));
    }

    [Fact]
    public async Task Evaluate_FirstPassWithManyCompletions_FlagsBackfill()
    {
        var (engine, store) = Create(anyTransaction: true);

        await engine.EvaluateAsync(UserId, Snapshot([Ind("spend_lt_income", "L1", 100m, 0.7m)]));

        Assert.True(store.Completions.Count > 1);
        Assert.All(store.Completions, c => Assert.True((bool)c.Evidence["backfill"]!));
    }

    [Fact]
    public async Task Evaluate_FirstPassWithOneCompletion_IsNotBackfill()
    {
        var (engine, store) = Create(anyTransaction: true);

        await engine.EvaluateAsync(UserId, Snapshot());

        var only = Assert.Single(store.Completions);
        Assert.False(only.Evidence.ContainsKey("backfill"));
    }

    [Fact]
    public async Task Evaluate_LaterPass_IsNeverBackfill()
    {
        var (engine, store) = Create(anyTransaction: true);
        await engine.EvaluateAsync(UserId, Snapshot());

        await engine.EvaluateAsync(UserId, Snapshot([Ind("spend_lt_income", "L1", 100m, 0.7m)]));

        Assert.All(store.Completions.Where(c => c.QuestCode.StartsWith("stars.")),
            c => Assert.False(c.Evidence.ContainsKey("backfill")));
    }

    [Fact]
    public async Task Evaluate_StaleSavingsValuation_BlocksFencePostsAndCoverStars()
    {
        var (engine, store) = Create();
        var cover = Cover(2.1m);

        await engine.EvaluateAsync(UserId, Snapshot([cover], [Valued(new DateTime(2026, 8, 20))]));

        Assert.DoesNotContain(store.Completions, c => c.QuestCode == "l2.fence_posts");
        Assert.DoesNotContain(store.Completions, c => c.QuestCode == "stars.liquid_savings_ratio");

        await engine.EvaluateAsync(UserId, Snapshot([cover], [Valued(new DateTime(2026, 10, 20))]));

        Assert.Contains(store.Completions, c => c.QuestCode == "l2.fence_posts");
        Assert.Contains(store.Completions, c => c.QuestCode == "stars.liquid_savings_ratio");
    }

    [Fact]
    public async Task Evaluate_TransactionsLoadFailed_CompletesNoMonthBasedQuest()
    {
        var (engine, store) = Create();

        await engine.EvaluateAsync(UserId, Snapshot(transactionsFailed: true));

        Assert.DoesNotContain(store.Completions, c => c.QuestCode is "l1.sort_the_pile" or "l1.in_the_green" or "l1.full_picture");
    }

    private static Account Acct(Guid id) => new() { Id = id, Name = "Acct" };

    [Fact]
    public async Task Evaluate_ThreeMonthsOfData_UpsertsOneRecordPerMonthWithTransactions()
    {
        // Arrange: September and August have rows; July has none.
        var (engine, store, ledger) = CreateWithLedger(anyTransaction: true);
        var acct = Guid.NewGuid();
        store.Accounts.Add(Acct(acct));
        var transactions = new List<Transaction>
        {
            Tx(2026, 9, 3, 10_000_000m, "CR", acct),
            Tx(2026, 9, 5, 4_000_000m, "DB", acct),
            Tx(2026, 8, 2, 1_000_000m, "DB", acct),
        };

        // Act
        await engine.EvaluateAsync(UserId, Snapshot(transactions: transactions));

        // Assert
        Assert.Equal(2, ledger.LastUpsert.Count);
        var sep = ledger.LastUpsert.Single(r => r.Month == new DateOnly(2026, 9, 1));
        Assert.Equal("green", sep.Result);
        Assert.Equal(1, sep.AccountsCovered);
        Assert.Equal(1, sep.AccountsTotal);
        Assert.DoesNotContain(ledger.LastUpsert, r => r.Month == new DateOnly(2026, 7, 1));
    }

    [Fact]
    public async Task Evaluate_FiveAccountsFourWithData_RecordsFourOfFive()
    {
        // Arrange
        var (engine, store, ledger) = CreateWithLedger(anyTransaction: true);
        var accounts = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToList();
        foreach (var id in accounts) store.Accounts.Add(Acct(id));
        var transactions = new List<Transaction> { Tx(2026, 9, 1, 10_000_000m, "CR", accounts[0]) };
        transactions.AddRange(accounts.Take(4).Select(id => Tx(2026, 9, 2, 1_000_000m, "DB", id)));

        // Act
        await engine.EvaluateAsync(UserId, Snapshot(transactions: transactions));

        // Assert
        var sep = ledger.LastUpsert.Single(r => r.Month == new DateOnly(2026, 9, 1));
        Assert.Equal(4, sep.AccountsCovered);
        Assert.Equal(5, sep.AccountsTotal);
    }

    [Fact]
    public async Task Evaluate_LedgerWriteThrows_StillStoresCompletionsAndLogs()
    {
        // Arrange
        var (engine, store, ledger) = CreateWithLedger(anyTransaction: true);
        ledger.Throws = true;

        // Act
        var fresh = await engine.EvaluateAsync(UserId, Snapshot());

        // Assert: the import did not fail, completions are stored.
        Assert.NotEmpty(store.Completions);
        Assert.Equal(1, ledger.UpsertCalls);
    }

    [Fact]
    public async Task Evaluate_TransactionsLoadFailed_DoesNotTouchTheLedger()
    {
        // Arrange
        var (engine, _, ledger) = CreateWithLedger();

        // Act
        await engine.EvaluateAsync(UserId, Snapshot(transactionsFailed: true));

        // Assert
        Assert.Equal(0, ledger.UpsertCalls);
    }

    [Fact]
    public async Task Evaluate_NothingNewCompleted_StillRefreshesTheLedger()
    {
        // Arrange
        var (engine, store, ledger) = CreateWithLedger(anyTransaction: true);
        var acct = Guid.NewGuid();
        store.Accounts.Add(Acct(acct));
        var transactions = new List<Transaction> { Tx(2026, 9, 3, 1_000_000m, "DB", acct) };
        await engine.EvaluateAsync(UserId, Snapshot(transactions: transactions));
        var callsAfterFirst = ledger.UpsertCalls;

        // Act: a second identical pass completes nothing new.
        var fresh = await engine.EvaluateAsync(UserId, Snapshot(transactions: transactions));

        // Assert
        Assert.Empty(fresh);
        Assert.Equal(callsAfterFirst + 1, ledger.UpsertCalls);
    }

    [Fact]
    public async Task Evaluate_ExistingCompletions_PassesInsertedAsSeenTrue()
    {
        // Arrange: an owner who already has a completion. Their first ledger write is history.
        var (engine, store, ledger) = CreateWithLedger(anyTransaction: true);
        store.Completions.Add(new Domain.Entities.QuestCompletion
        {
            Id = 99, UserId = UserId, QuestCode = "l1.meet_your_money", Rung = 0, CatalogVersion = 1,
            Evidence = new Dictionary<string, object?>(),
        });

        // Act
        await engine.EvaluateAsync(UserId, Snapshot());

        // Assert
        Assert.True(ledger.LastInsertedAsSeen);
    }

    [Fact]
    public async Task Evaluate_NoEarlierCompletions_PassesInsertedAsSeenFalse()
    {
        // Arrange
        var (engine, _, ledger) = CreateWithLedger(anyTransaction: true);

        // Act
        await engine.EvaluateAsync(UserId, Snapshot());

        // Assert
        Assert.False(ledger.LastInsertedAsSeen);
    }

    [Fact]
    public async Task Evaluate_RedMonthOnTwoPassesAndASecondRedMonth_StoresHonestHarvestOnce()
    {
        // Arrange: September runs over.
        var (engine, store, _) = CreateWithLedger(anyTransaction: true);
        var acct = Guid.NewGuid();
        store.Accounts.Add(Acct(acct));
        var sep = new List<Transaction>
        {
            Tx(2026, 9, 1, 5_000_000m, "CR", acct),
            Tx(2026, 9, 2, 8_000_000m, "DB", acct),
        };

        // Act
        await engine.EvaluateAsync(UserId, Snapshot(transactions: sep));
        await engine.EvaluateAsync(UserId, Snapshot(transactions: sep));            // same red month again
        var augAndSep = new List<Transaction>(sep)
        {
            Tx(2026, 8, 1, 3_000_000m, "CR", acct),
            Tx(2026, 8, 2, 6_000_000m, "DB", acct),                                  // a second red month
        };
        await engine.EvaluateAsync(UserId, Snapshot(transactions: augAndSep));

        // Assert
        Assert.Equal(1, store.Completions.Count(c => c.QuestCode == "l1.honest_harvest"));
    }

    [Fact]
    public async Task Evaluate_NoIncomeMonth_DoesNotAwardHonestHarvest()
    {
        // Arrange: spending, no income recorded -> neutral, never red.
        var (engine, store, _) = CreateWithLedger(anyTransaction: true);
        var acct = Guid.NewGuid();
        store.Accounts.Add(Acct(acct));
        var transactions = new List<Transaction> { Tx(2026, 9, 2, 8_000_000m, "DB", acct) };

        // Act
        await engine.EvaluateAsync(UserId, Snapshot(transactions: transactions));

        // Assert
        Assert.DoesNotContain(store.Completions, c => c.QuestCode == "l1.honest_harvest");
    }

    [Fact]
    public async Task Evaluate_ExpenseEqualsIncome_AwardsHonestHarvest()
    {
        // Arrange: a spend ratio of 1.00 is the rubric's 0-point breakpoint -> red.
        var (engine, store, _) = CreateWithLedger(anyTransaction: true);
        var acct = Guid.NewGuid();
        store.Accounts.Add(Acct(acct));
        var transactions = new List<Transaction>
        {
            Tx(2026, 9, 1, 5_000_000m, "CR", acct),
            Tx(2026, 9, 2, 5_000_000m, "DB", acct),
        };

        // Act
        await engine.EvaluateAsync(UserId, Snapshot(transactions: transactions));

        // Assert
        Assert.Contains(store.Completions, c => c.QuestCode == "l1.honest_harvest");
    }

    [Fact]
    public void IQuestStore_WriteSurface_IsOnlyCompletionsFocusSnoozesSeen()
    {
        // G1: the store has no path that can write a score.
        string[] allowed = ["InsertCompletionsAsync", "SetFocusAsync", "SetSnoozesAsync", "MarkSeenAsync"];
        string[] prefixes = ["Insert", "Set", "Mark", "Delete", "Update", "Save", "Upsert", "Write"];

        var writers = typeof(IQuestStore).GetMethods()
            .Select(m => m.Name)
            .Where(n => prefixes.Any(n.StartsWith))
            .ToList();

        Assert.All(writers, name => Assert.Contains(name, allowed));
        Assert.Equal(allowed.OrderBy(x => x), writers.OrderBy(x => x));
    }
}
