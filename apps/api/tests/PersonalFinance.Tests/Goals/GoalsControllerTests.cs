using MediatR;
using Microsoft.AspNetCore.Mvc;
using Moq;
using PersonalFinance.Api.Controllers;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Tests.Goals;

public class GoalsControllerTests
{
    private readonly Mock<IMediator> _mediator = new();

    private GoalsController Controller() => new(_mediator.Object);

    [Theory]
    [InlineData(0, 500, 1, 200)]
    [InlineData(-3, 0, 1, 1)]
    [InlineData(2, 50, 2, 50)]
    public async Task List_ClampsPageAndPageSize(int page, int pageSize, int expectedPage, int expectedSize)
    {
        // Arrange
        _mediator.Setup(m => m.Send(It.IsAny<GetGoalsQuery>(), It.IsAny<CancellationToken>())).ReturnsAsync(new GoalPageDto());

        // Act
        await Controller().List("big_purchase", "open", page, pageSize);

        // Assert
        _mediator.Verify(m => m.Send(It.Is<GetGoalsQuery>(q => q.Page == expectedPage && q.PageSize == expectedSize && q.Status == "open"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Contributions_ClampsPageSize()
    {
        // Arrange
        var id = Guid.NewGuid();
        _mediator.Setup(m => m.Send(It.IsAny<GetGoalContributionsQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PagedResult<GoalContributionDto>());

        // Act
        await Controller().Contributions(id, 1, 1000);

        // Assert
        _mediator.Verify(m => m.Send(It.Is<GetGoalContributionsQuery>(q => q.GoalId == id && q.PageSize == 200), It.IsAny<CancellationToken>()));
    }

    [Fact]
    public async Task Get_NullResult_404()
    {
        // Arrange
        _mediator.Setup(m => m.Send(It.IsAny<GetGoalQuery>(), It.IsAny<CancellationToken>())).ReturnsAsync((GoalDto?)null);

        // Act
        var result = await Controller().Get(Guid.NewGuid());

        // Assert
        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task Update_UsesRouteIdAndNullIs404()
    {
        // Arrange
        var id = Guid.NewGuid();
        _mediator.Setup(m => m.Send(It.IsAny<UpdateGoalCommand>(), It.IsAny<CancellationToken>())).ReturnsAsync((GoalDto?)null);
        var body = new UpdateGoalCommand(Guid.Empty, "other", "X", null, 2, 1m, null, null, null, "active");

        // Act
        var result = await Controller().Update(id, body);

        // Assert
        Assert.IsType<NotFoundResult>(result.Result);
        _mediator.Verify(m => m.Send(It.Is<UpdateGoalCommand>(c => c.Id == id), It.IsAny<CancellationToken>()));
    }

    [Fact]
    public async Task Delete_NotFound_404AndFound_204()
    {
        // Arrange
        _mediator.SetupSequence(m => m.Send(It.IsAny<DeleteGoalCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false).ReturnsAsync(true);

        // Act / Assert
        Assert.IsType<NotFoundResult>(await Controller().Delete(Guid.NewGuid()));
        Assert.IsType<NoContentResult>(await Controller().Delete(Guid.NewGuid()));
    }

    [Fact]
    public async Task AddContribution_UsesRouteGoalId()
    {
        // Arrange
        var id = Guid.NewGuid();
        _mediator.Setup(m => m.Send(It.IsAny<AddGoalContributionCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GoalContributionDto(Guid.NewGuid(), 1m, new DateOnly(2026, 11, 9), null, null));

        // Act
        await Controller().AddContribution(id, new AddGoalContributionCommand(Guid.Empty, 1m, new DateOnly(2026, 11, 9), null, null));

        // Assert
        _mediator.Verify(m => m.Send(It.Is<AddGoalContributionCommand>(c => c.GoalId == id), It.IsAny<CancellationToken>()));
    }

    [Fact]
    public async Task ReplaceCostItems_UsesRouteGoalId()
    {
        // Arrange
        var id = Guid.NewGuid();
        _mediator.Setup(m => m.Send(It.IsAny<ReplaceGoalCostItemsCommand>(), It.IsAny<CancellationToken>())).ReturnsAsync(new GoalDto());

        // Act
        await Controller().ReplaceCostItems(id, new ReplaceGoalCostItemsCommand(Guid.Empty, []));

        // Assert
        _mediator.Verify(m => m.Send(It.Is<ReplaceGoalCostItemsCommand>(c => c.GoalId == id), It.IsAny<CancellationToken>()));
    }

    [Fact]
    public async Task Preview_And_Create_ForwardToMediator()
    {
        // Arrange
        _mediator.Setup(m => m.Send(It.IsAny<PreviewGoalQuery>(), It.IsAny<CancellationToken>())).ReturnsAsync(new GoalPreviewDto());
        _mediator.Setup(m => m.Send(It.IsAny<CreateGoalCommand>(), It.IsAny<CancellationToken>())).ReturnsAsync(new GoalDto());

        // Act
        var preview = await Controller().Preview(new PreviewGoalQuery(null, "other", 1m, null, null, null, null));
        var created = await Controller().Create(new CreateGoalCommand("other", "X", null, 2, 1m, null, null, null));

        // Assert
        Assert.IsType<OkObjectResult>(preview.Result);
        Assert.IsType<OkObjectResult>(created.Result);
    }
}
