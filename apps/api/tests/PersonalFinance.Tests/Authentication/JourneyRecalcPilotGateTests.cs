using MediatR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.EventHandlers;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Tests.Authentication;

public sealed class JourneyRecalcPilotGateTests
{
    private sealed record PilotMode(bool Enabled) : ICashflowPilotMode;

    [Fact]
    public async Task TransactionHandler_PilotEnabled_SkipsPlaceholderRecalc()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        var handler = new JourneyRecalcOnTransactionHandler(
            mediator.Object, new PilotMode(true), NullLogger<JourneyRecalcOnTransactionHandler>.Instance);

        // Act
        await handler.Handle(new TransactionCreatedEvent(new Transaction()), CancellationToken.None);

        // Assert
        mediator.Verify(m => m.Send(It.IsAny<RecalculateJourneyCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AssetHandler_PilotEnabled_SkipsPlaceholderRecalc()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        var handler = new JourneyRecalcOnAssetHandler(
            mediator.Object, new PilotMode(true), NullLogger<JourneyRecalcOnAssetHandler>.Instance);

        // Act
        await handler.Handle(new AssetUpdatedEvent(Guid.NewGuid()), CancellationToken.None);

        // Assert
        mediator.Verify(m => m.Send(It.IsAny<RecalculateJourneyCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task TransactionHandler_PilotDisabled_KeepsExistingRecalc()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        var handler = new JourneyRecalcOnTransactionHandler(
            mediator.Object, new PilotMode(false), NullLogger<JourneyRecalcOnTransactionHandler>.Instance);

        // Act
        await handler.Handle(new TransactionCreatedEvent(new Transaction()), CancellationToken.None);

        // Assert
        mediator.Verify(m => m.Send(It.IsAny<RecalculateJourneyCommand>(), It.IsAny<CancellationToken>()), Times.Once);
    }
}
