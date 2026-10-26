using MediatR;
using Microsoft.AspNetCore.Mvc;
using Moq;
using PersonalFinance.Api.Controllers;
using PersonalFinance.Application.Commands.Journey;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using Xunit;

namespace PersonalFinance.Tests.Controllers;

public class JourneyControllerNoDebtsTests
{
    private static readonly Guid Owner = Guid.Parse("8d2f5a61-1c3b-4e7a-b9d0-6e4f2a1c7b35");

    private readonly Mock<IMediator> _mediator = new();
    private readonly Mock<IJourneyConfirmationService> _confirmation = new();

    private JourneyController Controller()
    {
        var caller = new Mock<ICurrentUser>();
        caller.SetupGet(c => c.UserId).Returns(Owner);
        return new JourneyController(
            _mediator.Object, new Mock<IJourneyScoringService>().Object,
            _confirmation.Object, caller.Object);
    }

    [Fact]
    public async Task GetNoDebts_WhenConfirmed_ReturnsTheTimestamp()
    {
        // Arrange
        var at = new DateTime(2026, 10, 25, 8, 0, 0, DateTimeKind.Utc);
        _confirmation.Setup(c => c.GetNoDebtsConfirmedAtAsync(Owner, It.IsAny<CancellationToken>())).ReturnsAsync(at);

        // Act
        var result = await Controller().GetNoDebts(CancellationToken.None);

        // Assert
        var dto = Assert.IsType<NoDebtsConfirmationDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(at, dto.ConfirmedAt);
    }

    [Fact]
    public async Task GetNoDebts_WhenNotConfirmed_ReturnsNull()
    {
        _confirmation.Setup(c => c.GetNoDebtsConfirmedAtAsync(Owner, It.IsAny<CancellationToken>())).ReturnsAsync((DateTime?)null);

        var result = await Controller().GetNoDebts(CancellationToken.None);

        var dto = Assert.IsType<NoDebtsConfirmationDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Null(dto.ConfirmedAt);
    }

    [Fact]
    public async Task ConfirmNoDebts_SendsAConfirmedCommandForTheCaller()
    {
        // Arrange
        _mediator.Setup(m => m.Send(It.IsAny<SetNoDebtsConfirmationCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new NoDebtsConfirmationDto(DateTime.UtcNow));

        // Act
        await Controller().ConfirmNoDebts(CancellationToken.None);

        // Assert
        _mediator.Verify(m => m.Send(
            It.Is<SetNoDebtsConfirmationCommand>(c => c.UserId == Owner && c.Confirmed),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ClearNoDebts_SendsAnUnconfirmedCommandForTheCaller()
    {
        _mediator.Setup(m => m.Send(It.IsAny<SetNoDebtsConfirmationCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new NoDebtsConfirmationDto(null));

        await Controller().ClearNoDebts(CancellationToken.None);

        _mediator.Verify(m => m.Send(
            It.Is<SetNoDebtsConfirmationCommand>(c => c.UserId == Owner && !c.Confirmed),
            It.IsAny<CancellationToken>()), Times.Once);
    }
}
