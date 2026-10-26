using MediatR;
using Microsoft.AspNetCore.Mvc;
using Moq;
using PersonalFinance.Api.Controllers;
using PersonalFinance.Application.Commands.Quests;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using Xunit;

namespace PersonalFinance.Tests.Controllers;

public class JourneyControllerQuestTests
{
    private static readonly Guid Owner = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly QuestBoardDto Board = new(1, "L1", null, [], [], null);

    private readonly Mock<IMediator> _mediator = new();
    private readonly Mock<IJourneyScoringService> _scoring = new();

    private JourneyController Controller()
    {
        var caller = new Mock<ICurrentUser>();
        caller.SetupGet(c => c.UserId).Returns(Owner);
        return new JourneyController(_mediator.Object, _scoring.Object, new Mock<IJourneyConfirmationService>().Object, caller.Object);
    }

    [Fact]
    public async Task GetQuests_SendsTheBoardQueryForTheCaller_AndNeverTouchesScoring()
    {
        // Arrange
        _mediator.Setup(m => m.Send(It.IsAny<GetQuestBoardQuery>(), It.IsAny<CancellationToken>())).ReturnsAsync(Board);

        // Act
        var result = await Controller().GetQuests(CancellationToken.None);

        // Assert
        Assert.Same(Board, Assert.IsType<OkObjectResult>(result.Result).Value);
        _mediator.Verify(m => m.Send(It.Is<GetQuestBoardQuery>(q => q.UserId == Owner), It.IsAny<CancellationToken>()), Times.Once);
        _scoring.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task SetFocus_SendsTheCodeAndTheCallerNotABodyUser()
    {
        _mediator.Setup(m => m.Send(It.IsAny<SetQuestFocusCommand>(), It.IsAny<CancellationToken>())).ReturnsAsync(Board);

        await Controller().SetFocus("l1.meet_your_money", CancellationToken.None);

        _mediator.Verify(m => m.Send(
            It.Is<SetQuestFocusCommand>(c => c.UserId == Owner && c.Code == "l1.meet_your_money"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Snooze_SendsTheCodeAndTheCaller()
    {
        _mediator.Setup(m => m.Send(It.IsAny<SnoozeQuestCommand>(), It.IsAny<CancellationToken>())).ReturnsAsync(Board);

        await Controller().Snooze("l1.in_the_green", CancellationToken.None);

        _mediator.Verify(m => m.Send(
            It.Is<SnoozeQuestCommand>(c => c.UserId == Owner && c.Code == "l1.in_the_green"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task MarkSeen_SendsTheIdsAndReturnsNoContent()
    {
        var result = await Controller().MarkSeen(new MarkQuestsSeenRequest([4, 5]), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _mediator.Verify(m => m.Send(
            It.Is<MarkQuestsSeenCommand>(c => c.UserId == Owner && c.Ids.SequenceEqual(new long[] { 4, 5 })),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public void GetQuests_DoesNotDependOnAnyAiClient()
    {
        var parameterTypes = typeof(JourneyController).GetConstructors().Single()
            .GetParameters().Select(p => p.ParameterType.Name).ToList();

        Assert.DoesNotContain(parameterTypes, n => n.Contains("Advisor") || n.Contains("Ai") || n.Contains("Llm"));
    }
}
