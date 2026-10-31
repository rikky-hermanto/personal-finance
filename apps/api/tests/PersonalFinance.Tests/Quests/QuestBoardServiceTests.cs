using System.Text.Json;
using System.Text.RegularExpressions;
using FluentValidation;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Quests;

public class QuestBoardServiceTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    private sealed class FixedTime(DateTimeOffset utc) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utc;
        public override TimeZoneInfo LocalTimeZone => TimeZoneInfo.Utc;
    }

    private static QuestBoardService Service(
        FakeQuestStore store, string today = "2026-10-25", FakeHarvestLedger? ledger = null) =>
        new(store, ledger ?? new FakeHarvestLedger(), new FixedTime(DateTimeOffset.Parse(today + "T05:00:00Z")));

    private static UserJourneyState Scores(params (string Code, decimal Score)[] live) => new()
    {
        UserId = UserId,
        CurrentLevel = 1,
        IndicatorScoresJson = JsonSerializer.Serialize(live.ToDictionary(l => l.Code, l => l.Score)),
    };

    private static void Complete(FakeQuestStore store, string code, int rung = 0) =>
        store.Completions.Add(new QuestCompletion
        {
            Id = store.Completions.Count + 1,
            UserId = UserId,
            QuestCode = code,
            Rung = (short)rung,
            CompletedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc),
            SeenAt = DateTime.UtcNow,
        });

    private static void CompleteAllL1Discovery(FakeQuestStore store)
    {
        Complete(store, "l1.meet_your_money");
        Complete(store, "l1.sort_the_pile");
        Complete(store, "l1.in_the_green");
    }

    private static IEnumerable<string> AllCodes(QuestBoardDto board) =>
        (board.Focus is null ? [] : new[] { board.Focus.Code }).Concat(board.Offers.Select(o => o.Code));

    [Fact]
    public async Task Board_NeverOffersMoreThanThree_FocusIncluded()
    {
        // Arrange
        var store = new FakeQuestStore { Focus = "l2.count_your_cushion" };

        // Act
        var board = await Service(store).GetBoardAsync(UserId);

        // Assert
        Assert.Equal(3, AllCodes(board).Count());
        Assert.Equal("l2.count_your_cushion", board.Focus!.Code);
    }

    [Fact]
    public async Task Board_WorkingLevelL1_DoesNotOfferFencePosts_ButOffersL2Discovery()
    {
        var store = new FakeQuestStore();
        CompleteAllL1Discovery(store);

        var board = await Service(store).GetBoardAsync(UserId);

        Assert.Equal("L1", board.WorkingLevel);
        Assert.DoesNotContain("l2.fence_posts", AllCodes(board));
        Assert.Contains("l2.count_your_cushion", AllCodes(board));
        Assert.Contains("l2.map_your_debts", AllCodes(board));
    }

    [Fact]
    public async Task Board_L1Cleared_OffersFencePosts_AndDropsL1Discovery()
    {
        var store = new FakeQuestStore { Scores = Scores(("spend_lt_income", 100m)) };

        var board = await Service(store).GetBoardAsync(UserId);

        Assert.Equal("L2", board.WorkingLevel);
        Assert.Contains("l2.fence_posts", AllCodes(board));
        Assert.DoesNotContain(AllCodes(board), c => c.StartsWith("l1."));
    }

    [Fact]
    public async Task Board_CurrentLevelOneAfterClearing_StillGatesOnWorkingLevel()
    {
        // currentLevel reads 1 both before and after L1 clears; the gate must not use it.
        var store = new FakeQuestStore { Scores = Scores(("spend_lt_income", 100m)) };
        Assert.Equal(1, store.Scores!.CurrentLevel);

        var board = await Service(store).GetBoardAsync(UserId);

        Assert.Equal("L2", board.WorkingLevel);
    }

    [Fact]
    public async Task Board_FocusFirst_ThenQuickDiscovery_ThenClosest()
    {
        var store = new FakeQuestStore { Focus = "l1.in_the_green" };
        store.Accounts.AddRange(Enumerable.Range(0, 5).Select(i => new Account { Id = Guid.NewGuid(), Name = $"A{i}" }));
        Complete(store, "l1.full_picture", 1);
        Complete(store, "l1.full_picture", 2);

        var board = await Service(store).GetBoardAsync(UserId);

        Assert.Equal("l1.in_the_green", board.Focus!.Code);
        Assert.Equal(["l1.full_picture", "l1.meet_your_money"], board.Offers.Select(o => o.Code).ToArray());
        Assert.Equal("2 of 5 accounts", board.Offers[0].Progress!.Label);
    }

    [Fact]
    public async Task Board_SnoozedQuest_IsHiddenUntilTheDate_ThenReturns()
    {
        var store = new FakeQuestStore { Snoozes = { ["l1.meet_your_money"] = "2026-11-25" } };

        var before = await Service(store, "2026-10-25").GetBoardAsync(UserId);
        var onTheDate = await Service(store, "2026-11-25").GetBoardAsync(UserId);

        Assert.DoesNotContain("l1.meet_your_money", AllCodes(before));
        Assert.Contains("l1.meet_your_money", AllCodes(onTheDate));
    }

    [Fact]
    public async Task Board_CompletedQuest_IsNotOffered()
    {
        var store = new FakeQuestStore();
        Complete(store, "l1.meet_your_money");

        var board = await Service(store).GetBoardAsync(UserId);

        Assert.DoesNotContain("l1.meet_your_money", AllCodes(board));
    }

    [Fact]
    public async Task Board_RecognitionAndBoss_AreNeverOffered()
    {
        var store = new FakeQuestStore { Scores = Scores(("spend_lt_income", 100m)) };

        var board = await Service(store).GetBoardAsync(UserId);

        Assert.DoesNotContain(AllCodes(board), c => c.StartsWith("stars.") || c.EndsWith(".boss"));
    }

    [Fact]
    public async Task Board_FullPicture_NoAccounts_IsNotOffered()
    {
        var board = await Service(new FakeQuestStore()).GetBoardAsync(UserId);

        Assert.DoesNotContain("l1.full_picture", AllCodes(board));
    }

    [Fact]
    public async Task SetFocus_NotACandidate_Throws400()
    {
        var service = Service(new FakeQuestStore());

        await Assert.ThrowsAsync<ValidationException>(() => service.SetFocusAsync(UserId, "l2.fence_posts"));
        await Assert.ThrowsAsync<ValidationException>(() => service.SetFocusAsync(UserId, "l1.boss"));
    }

    [Fact]
    public async Task SetFocus_UnknownCode_Throws404() =>
        await Assert.ThrowsAsync<KeyNotFoundException>(() => Service(new FakeQuestStore()).SetFocusAsync(UserId, "nope"));

    [Fact]
    public async Task SetFocus_Candidate_SetsItFirst()
    {
        var store = new FakeQuestStore();

        var board = await Service(store).SetFocusAsync(UserId, "l1.in_the_green");

        Assert.Equal("l1.in_the_green", store.Focus);
        Assert.Equal("l1.in_the_green", board.Focus!.Code);
    }

    [Fact]
    public async Task Snooze_ClearsFocusOfThatQuest()
    {
        var store = new FakeQuestStore { Focus = "l1.meet_your_money" };

        var board = await Service(store).SnoozeAsync(UserId, "l1.meet_your_money");

        Assert.Null(store.Focus);
        Assert.Null(board.Focus);
        Assert.Equal("2026-11-25", store.Snoozes["l1.meet_your_money"]);
    }

    [Fact]
    public async Task Snooze_OtherQuestFocused_KeepsThatFocus()
    {
        var store = new FakeQuestStore { Focus = "l1.in_the_green" };

        await Service(store).SnoozeAsync(UserId, "l1.meet_your_money");

        Assert.Equal("l1.in_the_green", store.Focus);
    }

    [Fact]
    public async Task SetFocus_KeepsExistingSnoozes()
    {
        var store = new FakeQuestStore { Snoozes = { ["l2.map_your_debts"] = "2026-12-01" } };

        await Service(store).SetFocusAsync(UserId, "l1.in_the_green");

        Assert.Equal("2026-12-01", store.Snoozes["l2.map_your_debts"]);
    }

    [Fact]
    public async Task Snooze_KeepsExistingSnoozes()
    {
        var store = new FakeQuestStore { Snoozes = { ["l2.map_your_debts"] = "2026-12-01" } };

        await Service(store).SnoozeAsync(UserId, "l1.meet_your_money");

        Assert.Equal(2, store.Snoozes.Count);
        Assert.Equal("2026-12-01", store.Snoozes["l2.map_your_debts"]);
    }

    [Fact]
    public async Task Snooze_UnknownCode_Throws404() =>
        await Assert.ThrowsAsync<KeyNotFoundException>(() => Service(new FakeQuestStore()).SnoozeAsync(UserId, "nope"));

    [Fact]
    public async Task Board_NothingToOffer_ReturnsLevelGoalListingTheGaps()
    {
        var store = new FakeQuestStore { Scores = Scores(("spend_lt_income", 60m)) };
        CompleteAllL1Discovery(store);
        Complete(store, "l2.count_your_cushion");
        Complete(store, "l2.map_your_debts");

        var board = await Service(store).GetBoardAsync(UserId);

        Assert.Empty(AllCodes(board));
        Assert.Equal("Clear L1", board.LevelGoal!.Title);
        var gap = Assert.Single(board.LevelGoal.Gaps);
        Assert.Equal("spend_lt_income", gap.IndicatorCode);
        Assert.Equal("Spending under 89% of income", gap.Label);
        Assert.Equal(1, gap.Stars);
    }

    [Fact]
    public async Task Board_WorkingLevelHasNoLiveIndicator_LevelGoalSaysNotScoredYet()
    {
        var board = await Service(new FakeQuestStore()).GetBoardAsync(UserId);

        Assert.True(board.LevelGoal!.NotEvaluated);
        Assert.Equal("L1 is not scored yet", board.LevelGoal.Title);
        Assert.Empty(board.LevelGoal.Gaps);
    }

    [Fact]
    public async Task Board_AllScoredLevelsCleared_GoalPointsAtTheNextUnscoredLevel()
    {
        // No indicator is scored above L4 yet, so "all cleared" cannot occur; the goal names the first level without scores.
        var store = new FakeQuestStore
        {
            Scores = Scores(("spend_lt_income", 100m), ("liquid_savings_ratio", 100m), ("savings_rate", 100m)),
        };

        var board = await Service(store).GetBoardAsync(UserId);

        Assert.Equal("L4", board.WorkingLevel);
        Assert.True(board.LevelGoal!.NotEvaluated);
    }

    [Fact]
    public async Task Board_NeverCallsAnythingThatWritesScores()
    {
        var store = new FakeQuestStore();

        await Service(store).GetBoardAsync(UserId);

        Assert.Equal(0, store.WriteCalls);
    }

    [Fact]
    public async Task MarkSeen_EmptyList_DoesNothing()
    {
        var store = new FakeQuestStore();

        await Service(store).MarkSeenAsync(UserId, []);

        Assert.Equal(0, store.WriteCalls);
    }

    [Fact]
    public async Task MarkSeen_SetsSeenAtOnlyOnce()
    {
        var store = new FakeQuestStore();
        store.Completions.Add(new QuestCompletion { Id = 1, UserId = UserId, QuestCode = "l1.meet_your_money" });

        await Service(store).MarkSeenAsync(UserId, [1]);
        var first = store.Completions[0].SeenAt;
        await Service(store, "2026-12-01").MarkSeenAsync(UserId, [1]);

        Assert.NotNull(first);
        Assert.Equal(first, store.Completions[0].SeenAt);
    }

    [Fact]
    public void BoardDtos_HaveNoPointsLikeMember()
    {
        // G2: no points, gain or XP anywhere on the board.
        var bad = new Regex("point|gain|xp|reward", RegexOptions.IgnoreCase);
        Type[] types = [typeof(QuestBoardDto), typeof(QuestCardDto), typeof(QuestProgressDto),
            typeof(LevelGoalDto), typeof(LevelGoalGapDto),
            typeof(HarvestDto), typeof(HarvestItemDto), typeof(RhythmDto)];

        foreach (var type in types)
            Assert.DoesNotContain(type.GetProperties().Select(p => p.Name), bad.IsMatch);
    }

    private static void CompleteUnseen(FakeQuestStore store, string code, int rung = 0,
        bool backfill = false, long? id = null)
    {
        var evidence = new Dictionary<string, object?>();
        if (backfill) evidence["backfill"] = true;
        store.Completions.Add(new QuestCompletion
        {
            Id = id ?? store.Completions.Count + 1,
            UserId = UserId,
            QuestCode = code,
            Rung = (short)rung,
            CompletedAt = new DateTime(2026, 10, 3, 9, 0, 0, DateTimeKind.Utc),
            Evidence = evidence,
            SeenAt = null,
        });
    }

    private static FakeHarvestLedger LedgerWith(params (string Month, bool Seen)[] months)
    {
        var ledger = new FakeHarvestLedger();
        foreach (var (month, seen) in months)
            ledger.Rows.Add(new HarvestLedgerRow(
                new HarvestMonthRecord(DateOnly.Parse(month + "-01"), 10_000_000m, 8_000_000m, "green", 4, 5), seen));
        return ledger;
    }

    [Fact]
    public async Task Board_Harvest_TwoUnseenCompletionsAndAnUnseenMonth_HasExactlyTwoItems()
    {
        // Arrange
        var store = new FakeQuestStore();
        CompleteUnseen(store, "l1.meet_your_money", id: 41);
        CompleteUnseen(store, "l1.in_the_green", id: 42);
        var ledger = LedgerWith(("2026-09", false));

        // Act
        var board = await Service(store, ledger: ledger).GetBoardAsync(UserId);

        // Assert
        Assert.NotNull(board.Harvest);
        Assert.Equal(2, board.Harvest.Items.Count);
        Assert.Equal("2026-09", board.Harvest.Month);
    }

    [Fact]
    public async Task Board_Harvest_AfterMarkedSeen_IsNull()
    {
        // Arrange: all completions and months already seen.
        var store = new FakeQuestStore();
        Complete(store, "l1.meet_your_money");   // SeenAt set by the helper
        var ledger = LedgerWith(("2026-09", true));

        // Act
        var board = await Service(store, ledger: ledger).GetBoardAsync(UserId);

        // Assert
        Assert.Null(board.Harvest);
    }

    [Fact]
    public async Task Board_Harvest_FirstRunFlag_FoldsToOneItemWithEveryId()
    {
        // Arrange
        var store = new FakeQuestStore();
        CompleteUnseen(store, "l1.meet_your_money", backfill: true, id: 1);
        CompleteUnseen(store, "l1.in_the_green", backfill: true, id: 2);
        CompleteUnseen(store, "l2.map_your_debts", backfill: true, id: 3);

        // Act
        var board = await Service(store).GetBoardAsync(UserId);

        // Assert
        Assert.NotNull(board.Harvest);
        var card = Assert.Single(board.Harvest.Items);
        Assert.True(card.IsBackfill);
        Assert.Equal([1L, 2L, 3L], card.CompletionIds);
    }

    [Fact]
    public async Task Board_Harvest_UnknownCatalogCode_IsSkipped()
    {
        // Arrange
        var store = new FakeQuestStore();
        CompleteUnseen(store, "l1.meet_your_money", id: 1);
        CompleteUnseen(store, "retired.code.from.v0", id: 2);

        // Act
        var board = await Service(store).GetBoardAsync(UserId);

        // Assert
        Assert.NotNull(board.Harvest);
        var card = Assert.Single(board.Harvest.Items);
        Assert.Equal("l1.meet_your_money", card.Code);
    }

    [Fact]
    public async Task Board_Rhythm_ReflectsTheLedger()
    {
        // Arrange: three consecutive harvested months, last full month is September 2026.
        var store = new FakeQuestStore();
        var ledger = LedgerWith(("2026-07", true), ("2026-08", true), ("2026-09", true));

        // Act
        var board = await Service(store, ledger: ledger).GetBoardAsync(UserId);

        // Assert
        Assert.Equal(new RhythmDto(3, 3), board.Rhythm);
    }
}
