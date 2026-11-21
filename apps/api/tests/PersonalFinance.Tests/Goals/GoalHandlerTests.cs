using FluentValidation;
using Moq;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Validation;
using PersonalFinance.Domain.Entities;
using static PersonalFinance.Tests.Goals.GoalTestSupport;

namespace PersonalFinance.Tests.Goals;

public class GoalHandlerTests
{
    private readonly Mock<IGoalService> _goals = GoalServiceMock();
    private readonly Mock<IFoundationCheckService> _foundation = FoundationMock();
    private readonly FixedTime _time = new();

    private CreateGoalCommandHandler CreateHandler() =>
        new(_goals.Object, _foundation.Object, Caller().Object, _time, new CreateGoalCommandValidator(_time), Log<CreateGoalCommandHandler>());

    private GetGoalsQueryHandler ListHandler() =>
        new(_goals.Object, _foundation.Object, Caller().Object, _time, new GetGoalsQueryValidator(), Log<GetGoalsQueryHandler>());

    private AddGoalContributionCommandHandler AddHandler() =>
        new(_goals.Object, Caller().Object, new AddGoalContributionCommandValidator(_time), Log<AddGoalContributionCommandHandler>());

    private static CreateGoalCommand NewVehicle() =>
        new("vehicle", "  Test vehicle  ", null, 2, 200_000_000m, new DateOnly(2028, 11, 30), null, null);

    private void InsertEchoes()
    {
        _goals.Setup(g => g.InsertAsync(It.IsAny<Goal>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Goal g, CancellationToken _) => { g.Id = Guid.NewGuid(); return g; });
    }

    private void List(IReadOnlyList<Goal> page, int total)
    {
        _goals.Setup(g => g.ListAsync(It.IsAny<string?>(), It.IsAny<IReadOnlyCollection<string>>(), 1,
                It.Is<int>(s => s != total || total <= page.Count), It.IsAny<CancellationToken>()))
            .ReturnsAsync((page, total));
    }

    [Fact]
    public async Task Handle_Create_TierComesFromKindNotRequest()
    {
        // Arrange
        InsertEchoes();

        // Act
        var dto = await CreateHandler().Handle(NewVehicle(), CancellationToken.None);

        // Assert
        Assert.Equal("big_purchase", dto.Kind);
        Assert.Equal("L3", dto.Tier);
        _goals.Verify(g => g.InsertAsync(It.Is<Goal>(x => x.Tier == "L3" && x.Kind == "big_purchase" && x.Recurrence == "one_off"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_Create_UserIdFromCurrentUser()
    {
        // Arrange
        InsertEchoes();

        // Act
        await CreateHandler().Handle(NewVehicle(), CancellationToken.None);

        // Assert
        _goals.Verify(g => g.InsertAsync(It.Is<Goal>(x => x.UserId == Owner && x.Name == "Test vehicle"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_Create_ColorIndexIsNextForOwner()
    {
        // Arrange
        InsertEchoes();
        _goals.Setup(g => g.NextColorIndexAsync(It.IsAny<CancellationToken>())).ReturnsAsync((short)5);

        // Act
        var dto = await CreateHandler().Handle(NewVehicle(), CancellationToken.None);

        // Assert
        Assert.Equal(5, dto.ColorIndex);
    }

    [Fact]
    public async Task Handle_Create_InvalidCommand_ThrowsAndNeverInserts()
    {
        // Act / Assert
        await Assert.ThrowsAsync<ValidationException>(() =>
            CreateHandler().Handle(NewVehicle() with { TargetAmount = 0m }, CancellationToken.None));
        _goals.Verify(g => g.InsertAsync(It.IsAny<Goal>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_Update_AchievedSetsAchievedAt()
    {
        // Arrange
        var goal = Goal(colour: 3);
        _goals.Setup(g => g.GetAsync(goal.Id, It.IsAny<CancellationToken>())).ReturnsAsync(goal);
        _goals.Setup(g => g.UpdateAsync(It.IsAny<Goal>(), It.IsAny<CancellationToken>())).ReturnsAsync((Goal g, CancellationToken _) => g);
        var handler = new UpdateGoalCommandHandler(_goals.Object, _foundation.Object, Caller().Object, _time,
            new UpdateGoalCommandValidator(), Log<UpdateGoalCommandHandler>());
        var command = new UpdateGoalCommand(goal.Id, "vehicle", "Test vehicle", null, 1, 200_000_000m, null, null, null, "achieved");

        // Act
        var achieved = await handler.Handle(command, CancellationToken.None);
        var reopened = await handler.Handle(command with { Status = "active" }, CancellationToken.None);

        // Assert
        Assert.Equal(_time.GetUtcNow().UtcDateTime, achieved!.AchievedAt);
        Assert.Null(reopened!.AchievedAt);
        Assert.Equal(3, reopened.ColorIndex);  // colour never changes on update
    }

    [Fact]
    public async Task Handle_Update_MissingGoal_ReturnsNull()
    {
        // Arrange
        var handler = new UpdateGoalCommandHandler(_goals.Object, _foundation.Object, Caller().Object, _time,
            new UpdateGoalCommandValidator(), Log<UpdateGoalCommandHandler>());

        // Act
        var result = await handler.Handle(
            new UpdateGoalCommand(Guid.NewGuid(), "other", "X", null, 2, 1m, null, null, null, "active"), CancellationToken.None);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task Handle_AddContribution_WithdrawalBelowZero_Throws()
    {
        // Arrange
        var goal = Goal();
        _goals.Setup(g => g.GetAsync(goal.Id, It.IsAny<CancellationToken>())).ReturnsAsync(goal);
        _goals.Setup(g => g.ContributionsForAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([Contribution(goal.Id, 50_000_000m)]);

        // Act / Assert
        await Assert.ThrowsAsync<ValidationException>(() => AddHandler().Handle(
            new AddGoalContributionCommand(goal.Id, -60_000_000m, Today, null, null), CancellationToken.None));
        _goals.Verify(g => g.InsertContributionAsync(It.IsAny<GoalContribution>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_AddContribution_WithdrawalWithinAllocated_InsertsNegativeRowForCaller()
    {
        // Arrange
        var goal = Goal();
        _goals.Setup(g => g.GetAsync(goal.Id, It.IsAny<CancellationToken>())).ReturnsAsync(goal);
        _goals.Setup(g => g.ContributionsForAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([Contribution(goal.Id, 50_000_000m)]);
        _goals.Setup(g => g.InsertContributionAsync(It.IsAny<GoalContribution>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((GoalContribution c, CancellationToken _) => c);

        // Act
        var dto = await AddHandler().Handle(new AddGoalContributionCommand(goal.Id, -50_000_000m, Today, null, null), CancellationToken.None);

        // Assert
        Assert.Equal(-50_000_000m, dto.Amount);
        _goals.Verify(g => g.InsertContributionAsync(It.Is<GoalContribution>(c => c.UserId == Owner && c.GoalId == goal.Id),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_AddContribution_AccountNotVisible_Throws()
    {
        // Arrange
        var goal = Goal();
        _goals.Setup(g => g.GetAsync(goal.Id, It.IsAny<CancellationToken>())).ReturnsAsync(goal);
        _goals.Setup(g => g.AccountVisibleAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(false);

        // Act / Assert
        await Assert.ThrowsAsync<ValidationException>(() => AddHandler().Handle(
            new AddGoalContributionCommand(goal.Id, 1_000_000m, Today, Guid.NewGuid(), null), CancellationToken.None));
    }

    [Fact]
    public async Task Handle_AddContribution_MissingGoal_ThrowsKeyNotFound()
    {
        // Act / Assert
        await Assert.ThrowsAsync<KeyNotFoundException>(() => AddHandler().Handle(
            new AddGoalContributionCommand(Guid.NewGuid(), 1_000_000m, Today, null, null), CancellationToken.None));
    }

    [Fact]
    public async Task Handle_DeleteContribution_WouldLeaveAllocatedNegative_Throws()
    {
        // Arrange: +50M then -30M; deleting the deposit would leave -30M
        var goalId = Guid.NewGuid();
        var deposit = Contribution(goalId, 50_000_000m);
        _goals.Setup(g => g.ContributionsForAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([deposit, Contribution(goalId, -30_000_000m)]);
        var handler = new DeleteGoalContributionCommandHandler(_goals.Object, Log<DeleteGoalContributionCommandHandler>());

        // Act / Assert
        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.Handle(new DeleteGoalContributionCommand(goalId, deposit.Id), CancellationToken.None));
    }

    [Fact]
    public async Task Handle_ReplaceCostItems_TargetExcludesLoanPrincipal()
    {
        // Arrange
        var goal = Goal(category: "house_land", target: 1m);
        _goals.Setup(g => g.GetAsync(goal.Id, It.IsAny<CancellationToken>())).ReturnsAsync(goal);
        _goals.Setup(g => g.UpdateAsync(It.IsAny<Goal>(), It.IsAny<CancellationToken>())).ReturnsAsync((Goal g, CancellationToken _) => g);
        _goals.Setup(g => g.CostItemsForAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([
                new GoalCostItem { GoalId = goal.Id, ItemType = "down_payment", Label = "DP", Amount = 100_000_000m },
                new GoalCostItem { GoalId = goal.Id, ItemType = "loan_principal", Label = "Loan", Amount = 400_000_000m, SortOrder = 1 },
                new GoalCostItem { GoalId = goal.Id, ItemType = "tax", Label = "Tax", Amount = 25_000_000m, SortOrder = 2 },
            ]);
        var handler = new ReplaceGoalCostItemsCommandHandler(_goals.Object, _foundation.Object, Caller().Object, _time,
            new ReplaceGoalCostItemsCommandValidator(), Log<ReplaceGoalCostItemsCommandHandler>());
        var items = new List<GoalCostItemInput>
        {
            new("down_payment", "DP", 100_000_000m),
            new("loan_principal", "Loan", 400_000_000m),
            new("tax", "Tax", 25_000_000m),
        };

        // Act
        var dto = await handler.Handle(new ReplaceGoalCostItemsCommand(goal.Id, items), CancellationToken.None);

        // Assert
        Assert.Equal(125_000_000m, dto.TargetAmount);
        Assert.Equal(525_000_000m, dto.TotalCost);
        _goals.Verify(g => g.ReplaceCostItemsAsync(goal.Id, It.Is<IReadOnlyList<GoalCostItem>>(r => r.Count == 3 && r.All(x => x.UserId == Owner)),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_ReplaceCostItems_OnlyLoan_Throws()
    {
        // Arrange
        var goal = Goal(category: "vehicle");
        _goals.Setup(g => g.GetAsync(goal.Id, It.IsAny<CancellationToken>())).ReturnsAsync(goal);
        var handler = new ReplaceGoalCostItemsCommandHandler(_goals.Object, _foundation.Object, Caller().Object, _time,
            new ReplaceGoalCostItemsCommandValidator(), Log<ReplaceGoalCostItemsCommandHandler>());

        // Act / Assert
        await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(
            new ReplaceGoalCostItemsCommand(goal.Id, [new("loan_principal", "Loan", 100m)]), CancellationToken.None));
    }

    [Fact]
    public async Task Handle_GetGoals_LoadsContributionsOnceForPage()
    {
        // Arrange
        List([Goal("A"), Goal("B"), Goal("C")], 3);

        // Act
        var page = await ListHandler().Handle(new GetGoalsQuery("big_purchase", "open"), CancellationToken.None);

        // Assert
        Assert.Equal(3, page.Items.Count);
        _goals.Verify(g => g.ContributionsForAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()), Times.Once);
        _goals.Verify(g => g.CostItemsForAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()), Times.Once);
        _foundation.Verify(f => f.EvaluateAsync(Owner, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal("clear", page.Foundation.State);
        Assert.All(page.Items, i => Assert.Equal("clear", i.GateState));
    }

    [Fact]
    public async Task Handle_GetGoals_OpenSummaryCoversAllOpenGoalsNotOnlyPage()
    {
        // Arrange: a page of 1 out of 2 open goals; the summary must include both
        var first = Goal("First", 120_000_000m, new DateOnly(2027, 11, 9));
        var second = Goal("Second", 240_000_000m, new DateOnly(2027, 11, 9));
        _goals.Setup(g => g.ListAsync("big_purchase", It.IsAny<IReadOnlyCollection<string>>(), 1, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(([first], 2));
        _goals.Setup(g => g.ListAsync("big_purchase", It.IsAny<IReadOnlyCollection<string>>(), 1, 2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(([first, second], 2));

        // Act
        var page = await ListHandler().Handle(new GetGoalsQuery("big_purchase", "open", 1, 1), CancellationToken.None);

        // Assert
        Assert.Single(page.Items);
        Assert.NotNull(page.Summary);
        Assert.Equal(2, page.Summary!.Segments.Count);
        Assert.Equal(30_000_000m, page.Summary.MonthlyTotal);  // 10M + 20M a month over 12 months
        Assert.Equal(2, page.Summary.ScheduledCount);
        Assert.Equal(33.33m, page.Summary.Segments[0].BarShare);
        Assert.Equal(66.67m, page.Summary.Segments[1].BarShare);
    }

    [Fact]
    public async Task Handle_GetGoals_SummaryExcludesDueSoonFromOverdue()
    {
        // Arrange
        var overdue = Goal("Overdue", 10_000_000m, new DateOnly(2026, 10, 1));
        var dueSoon = Goal("Due soon", 5_000_000m, new DateOnly(2026, 11, 30));
        var paused = Goal("Paused", 12_000_000m, new DateOnly(2027, 11, 9), status: "paused");
        List([overdue, dueSoon, paused], 3);

        // Act
        var page = await ListHandler().Handle(new GetGoalsQuery("big_purchase", "open"), CancellationToken.None);

        // Assert
        Assert.Equal(10_000_000m, page.Summary!.OverdueRemaining);
        Assert.Equal(["Overdue"], page.Summary.OverdueGoalNames);
        Assert.Equal(0m, page.Summary.MonthlyTotal);  // paused goals carry no monthly amount
        Assert.Equal(3, page.Summary.Segments.Count);
    }

    [Fact]
    public async Task Handle_GetGoals_Closed_NoSummary()
    {
        // Arrange
        List([Goal(status: "achieved")], 1);

        // Act
        var page = await ListHandler().Handle(new GetGoalsQuery("big_purchase", "closed"), CancellationToken.None);

        // Assert
        Assert.Null(page.Summary);
        _goals.Verify(g => g.ListAsync("big_purchase",
            It.Is<IReadOnlyCollection<string>>(s => s.SequenceEqual(new[] { "achieved", "cancelled" })), 1, 50, It.IsAny<CancellationToken>()));
    }

    [Fact]
    public async Task Handle_GetGoal_MapsDerivedNumbers()
    {
        // Arrange
        var goal = Goal(target: 200_000_000m, date: new DateOnly(2028, 11, 9));
        _goals.Setup(g => g.GetAsync(goal.Id, It.IsAny<CancellationToken>())).ReturnsAsync(goal);
        _goals.Setup(g => g.ContributionsForAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([Contribution(goal.Id, 50_000_000m)]);
        var handler = new GetGoalQueryHandler(_goals.Object, _foundation.Object, Caller().Object, _time);

        // Act
        var dto = await handler.Handle(new GetGoalQuery(goal.Id), CancellationToken.None);

        // Assert
        Assert.Equal(50_000_000m, dto!.Allocated);
        Assert.Equal(25.0m, dto.PercentComplete);
        Assert.Equal(6_250_000m, dto.MonthlyNeeded);
        Assert.Equal("scheduled", dto.Timeline);
    }

    [Fact]
    public async Task Handle_Preview_CostItemsTargetExcludesLoanPrincipal()
    {
        // Arrange
        var handler = new PreviewGoalQueryHandler(_goals.Object, _time);
        var query = new PreviewGoalQuery(null, "house_land", null,
            [new("down_payment", "DP", 120_000_000m), new("loan_principal", "Loan", 480_000_000m)],
            new DateOnly(2028, 11, 9), null, null);

        // Act
        var preview = await handler.Handle(query, CancellationToken.None);

        // Assert
        Assert.Equal(120_000_000m, preview.CashNeeded);
        Assert.Equal(600_000_000m, preview.TotalCost);
        Assert.Equal(5_000_000m, preview.MonthlyNeeded);
        _goals.Verify(g => g.InsertAsync(It.IsAny<Goal>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_Preview_WithdrawalAboveAllocated_Overdrawn()
    {
        // Arrange
        var goal = Goal(target: 200_000_000m, date: new DateOnly(2028, 11, 9));
        _goals.Setup(g => g.GetAsync(goal.Id, It.IsAny<CancellationToken>())).ReturnsAsync(goal);
        _goals.Setup(g => g.ContributionsForAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([Contribution(goal.Id, 50_000_000m)]);
        var handler = new PreviewGoalQueryHandler(_goals.Object, _time);

        // Act
        var over = await handler.Handle(new PreviewGoalQuery(goal.Id, null, null, null, null, null, -60_000_000m), CancellationToken.None);
        var add = await handler.Handle(new PreviewGoalQuery(goal.Id, null, null, null, null, null, 50_000_000m), CancellationToken.None);

        // Assert
        Assert.True(over.Overdrawn);
        Assert.Equal(50_000_000m, over.Allocated);
        Assert.False(add.Overdrawn);
        Assert.Equal(100_000_000m, add.AllocatedAfter);
        Assert.Equal(50.0m, add.PercentAfter);
    }

    [Fact]
    public async Task Handle_Preview_NoAmountYet_NoTargetTimeline()
    {
        // Arrange
        var handler = new PreviewGoalQueryHandler(_goals.Object, _time);

        // Act
        var preview = await handler.Handle(
            new PreviewGoalQuery(null, "vehicle", null, [new("loan_principal", "Loan", 10m)], null, null, null), CancellationToken.None);

        // Assert
        Assert.Equal("no_target", preview.Timeline);
        Assert.Equal(0m, preview.CashNeeded);
    }

    [Fact]
    public async Task Handle_DeleteGoal_ReturnsServiceResult()
    {
        // Arrange
        var id = Guid.NewGuid();
        _goals.Setup(g => g.DeleteAsync(id, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        // Act
        var deleted = await new DeleteGoalCommandHandler(_goals.Object, Log<DeleteGoalCommandHandler>())
            .Handle(new DeleteGoalCommand(id), CancellationToken.None);

        // Assert
        Assert.True(deleted);
    }

    [Fact]
    public async Task Handle_GetContributions_MapsPage()
    {
        // Arrange
        var goalId = Guid.NewGuid();
        _goals.Setup(g => g.ContributionPageAsync(goalId, 1, 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync(([Contribution(goalId, 5_000_000m, new DateOnly(2026, 11, 3))], 7));

        // Act
        var page = await new GetGoalContributionsQueryHandler(_goals.Object)
            .Handle(new GetGoalContributionsQuery(goalId), CancellationToken.None);

        // Assert
        Assert.Equal(7, page.Total);
        Assert.Equal(new DateOnly(2026, 11, 3), page.Items[0].ContributedOn);
    }

    [Fact]
    public void GoalCommands_NoneAffectJourney()
    {
        // Decision 6: no goal request may trigger AssetUpdatedEvent via PublishAssetUpdatedBehavior.
        var goalRequests = typeof(CreateGoalCommand).Assembly.GetTypes()
            .Where(t => t.Namespace == typeof(CreateGoalCommand).Namespace && t.Name.EndsWith("Command") || t.Name.EndsWith("Query"))
            .Where(t => t.Namespace == typeof(CreateGoalCommand).Namespace)
            .ToList();

        Assert.NotEmpty(goalRequests);
        Assert.DoesNotContain(goalRequests, t => typeof(IAffectsJourney).IsAssignableFrom(t));
    }
}
