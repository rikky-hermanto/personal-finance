using FluentValidation;
using Moq;
using PersonalFinance.Application.Commands.Harvest;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Validation;
using Xunit;

namespace PersonalFinance.Tests.Commands;

public class MarkHarvestSeenCommandHandlerTests
{
    private readonly Mock<IHarvestLedger> _ledger = new();

    private MarkHarvestSeenCommandHandler Handler() =>
        new(_ledger.Object, new MarkHarvestSeenCommandValidator());

    [Fact]
    public async Task Handle_ValidCall_PassesIdsAndParsedMonthToTheLedgerOnce()
    {
        // Act
        await Handler().Handle(new MarkHarvestSeenCommand([41, 42], "2026-09"), CancellationToken.None);

        // Assert
        _ledger.Verify(l => l.MarkSeenAsync(
            It.Is<IReadOnlyList<long>>(ids => ids.SequenceEqual(new long[] { 41, 42 })),
            new DateOnly(2026, 9, 1), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_NullMonth_PassesNullThrough()
    {
        // Act
        await Handler().Handle(new MarkHarvestSeenCommand([7], null), CancellationToken.None);

        // Assert
        _ledger.Verify(l => l.MarkSeenAsync(
            It.IsAny<IReadOnlyList<long>>(), null, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_TooManyIds_ThrowsAndNeverReachesTheLedger()
    {
        var ids = Enumerable.Range(1, 201).Select(i => (long)i).ToList();

        await Assert.ThrowsAsync<ValidationException>(
            () => Handler().Handle(new MarkHarvestSeenCommand(ids, null), CancellationToken.None));

        _ledger.Verify(l => l.MarkSeenAsync(
            It.IsAny<IReadOnlyList<long>>(), It.IsAny<DateOnly?>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_ZeroId_Throws()
    {
        await Assert.ThrowsAsync<ValidationException>(
            () => Handler().Handle(new MarkHarvestSeenCommand([0], null), CancellationToken.None));

        _ledger.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Handle_InvalidMonth_Throws()
    {
        await Assert.ThrowsAsync<ValidationException>(
            () => Handler().Handle(new MarkHarvestSeenCommand([1], "2026-13"), CancellationToken.None));

        _ledger.VerifyNoOtherCalls();
    }
}
