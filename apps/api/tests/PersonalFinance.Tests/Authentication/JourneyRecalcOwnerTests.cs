using MediatR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.EventHandlers;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Tests.Authentication;

public sealed class JourneyRecalcOwnerTests
{
    private static readonly Guid Owner = Guid.Parse("8d2f5a61-1c3b-4e7a-b9d0-6e4f2a1c7b35");

    [Fact]
    public async Task TransactionHandler_OwnedTransaction_RecalculatesForThatOwner()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        var handler = new JourneyRecalcOnTransactionHandler(
            mediator.Object, NullLogger<JourneyRecalcOnTransactionHandler>.Instance);

        // Act
        await handler.Handle(new TransactionCreatedEvent(new Transaction { UserId = Owner }), CancellationToken.None);

        // Assert
        mediator.Verify(m => m.Send(It.Is<RecalculateJourneyCommand>(c => c.UserId == Owner),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task TransactionHandler_OwnerlessTransaction_SkipsRecalc()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        var handler = new JourneyRecalcOnTransactionHandler(
            mediator.Object, NullLogger<JourneyRecalcOnTransactionHandler>.Instance);

        // Act
        await handler.Handle(new TransactionCreatedEvent(new Transaction()), CancellationToken.None);

        // Assert
        mediator.Verify(m => m.Send(It.IsAny<RecalculateJourneyCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AssetHandler_OwnedEvent_RecalculatesForThatOwner()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        var handler = new JourneyRecalcOnAssetHandler(mediator.Object, NullLogger<JourneyRecalcOnAssetHandler>.Instance);

        // Act
        await handler.Handle(new AssetUpdatedEvent(Owner), CancellationToken.None);

        // Assert
        mediator.Verify(m => m.Send(It.Is<RecalculateJourneyCommand>(c => c.UserId == Owner),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AssetHandler_EmptyOwner_SkipsRecalc()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        var handler = new JourneyRecalcOnAssetHandler(mediator.Object, NullLogger<JourneyRecalcOnAssetHandler>.Instance);

        // Act
        await handler.Handle(new AssetUpdatedEvent(Guid.Empty), CancellationToken.None);

        // Assert
        mediator.Verify(m => m.Send(It.IsAny<RecalculateJourneyCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task TransactionsSubmittedHandler_OwnedBatch_RecalculatesForThatOwner()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        var handler = new JourneyRecalcOnTransactionsSubmittedHandler(
            mediator.Object, NullLogger<JourneyRecalcOnTransactionsSubmittedHandler>.Instance);

        // Act
        await handler.Handle(new TransactionsSubmittedEvent(Owner, 3), CancellationToken.None);

        // Assert
        mediator.Verify(m => m.Send(It.Is<RecalculateJourneyCommand>(c => c.UserId == Owner),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task TransactionsSubmittedHandler_OwnerlessBatch_SkipsRecalc()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        var handler = new JourneyRecalcOnTransactionsSubmittedHandler(
            mediator.Object, NullLogger<JourneyRecalcOnTransactionsSubmittedHandler>.Instance);

        // Act
        await handler.Handle(new TransactionsSubmittedEvent(Guid.Empty, 3), CancellationToken.None);

        // Assert
        mediator.Verify(m => m.Send(It.IsAny<RecalculateJourneyCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task TransactionsSubmittedHandler_RecalcThrows_DoesNotThrow()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        mediator.Setup(m => m.Send(It.IsAny<RecalculateJourneyCommand>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("boom"));
        var handler = new JourneyRecalcOnTransactionsSubmittedHandler(
            mediator.Object, NullLogger<JourneyRecalcOnTransactionsSubmittedHandler>.Instance);

        // Act
        var act = () => handler.Handle(new TransactionsSubmittedEvent(Owner, 3), CancellationToken.None);

        // Assert
        await act();  // completes without throwing
    }
}
