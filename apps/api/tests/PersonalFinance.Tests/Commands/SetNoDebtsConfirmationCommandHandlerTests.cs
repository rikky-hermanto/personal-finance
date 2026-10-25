using MediatR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Commands.Journey;
using PersonalFinance.Application.Interfaces;
using Xunit;

namespace PersonalFinance.Tests.Commands;

public class SetNoDebtsConfirmationCommandHandlerTests
{
    private static readonly Guid Owner = Guid.Parse("8d2f5a61-1c3b-4e7a-b9d0-6e4f2a1c7b35");

    private static SetNoDebtsConfirmationCommandHandler Handler(
        Mock<IJourneyConfirmationService> confirmation, Mock<IMediator> mediator) =>
        new(confirmation.Object, mediator.Object, NullLogger<SetNoDebtsConfirmationCommandHandler>.Instance);

    [Fact]
    public async Task Handle_Confirmed_StoresATimestampThenRecalculates()
    {
        // Arrange
        var calls = new List<string>();
        var confirmation = new Mock<IJourneyConfirmationService>();
        confirmation.Setup(c => c.SetNoDebtsConfirmedAtAsync(Owner, It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Callback(() => calls.Add("store")).Returns(Task.CompletedTask);
        var mediator = new Mock<IMediator>();
        mediator.Setup(m => m.Send(It.IsAny<RecalculateJourneyCommand>(), It.IsAny<CancellationToken>()))
            .Callback(() => calls.Add("recalculate"));

        // Act
        var result = await Handler(confirmation, mediator)
            .Handle(new SetNoDebtsConfirmationCommand(Owner, true), CancellationToken.None);

        // Assert
        Assert.NotNull(result.ConfirmedAt);
        Assert.Equal(new[] { "store", "recalculate" }, calls);
        confirmation.Verify(c => c.SetNoDebtsConfirmedAtAsync(
            Owner, It.Is<DateTime?>(d => d.HasValue), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_Cleared_StoresNullThenRecalculates()
    {
        // Arrange
        var confirmation = new Mock<IJourneyConfirmationService>();
        var mediator = new Mock<IMediator>();

        // Act
        var result = await Handler(confirmation, mediator)
            .Handle(new SetNoDebtsConfirmationCommand(Owner, false), CancellationToken.None);

        // Assert
        Assert.Null(result.ConfirmedAt);
        confirmation.Verify(c => c.SetNoDebtsConfirmedAtAsync(Owner, null, It.IsAny<CancellationToken>()), Times.Once);
        mediator.Verify(m => m.Send(It.Is<RecalculateJourneyCommand>(c => c.UserId == Owner),
            It.IsAny<CancellationToken>()), Times.Once);
    }
}
