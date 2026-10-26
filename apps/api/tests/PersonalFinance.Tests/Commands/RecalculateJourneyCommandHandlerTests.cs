using Microsoft.Extensions.Logging;
using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Quests;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Commands;

public class RecalculateJourneyCommandHandlerTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    private static readonly JourneyStateDto State =
        new(1, 33.33m, new Dictionary<string, decimal> { ["L1"] = 100m }, [], [], new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc));

    private static readonly ScoringSnapshot Snapshot =
        new(new DateOnly(2026, 10, 25), [], [], [], null, true, []);

    private readonly Mock<IJourneyScoringService> _scoring = new();
    private readonly Mock<IQuestEngine> _engine = new();
    private readonly Mock<ILogger<RecalculateJourneyCommandHandler>> _logger = new();

    public RecalculateJourneyCommandHandlerTests()
    {
        _scoring.Setup(s => s.RecalculateWithSnapshotAsync(UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new JourneyRecalculation(State, Snapshot));
    }

    private RecalculateJourneyCommandHandler Handler() => new(_scoring.Object, _engine.Object, _logger.Object);

    [Fact]
    public async Task Handle_EngineSucceeds_ReturnsTheScoringState()
    {
        // Arrange
        _engine.Setup(e => e.EvaluateAsync(UserId, Snapshot, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<QuestCompletion>());

        // Act
        var result = await Handler().Handle(new RecalculateJourneyCommand(UserId), CancellationToken.None);

        // Assert
        Assert.Same(State, result);
        _engine.Verify(e => e.EvaluateAsync(UserId, Snapshot, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_EngineThrows_StillReturnsTheSameState_AndLogsError()
    {
        _engine.Setup(e => e.EvaluateAsync(It.IsAny<Guid>(), It.IsAny<ScoringSnapshot>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("boom"));

        var result = await Handler().Handle(new RecalculateJourneyCommand(UserId), CancellationToken.None);

        Assert.Same(State, result);
        _logger.Verify(l => l.Log(
            LogLevel.Error,
            It.IsAny<EventId>(),
            It.IsAny<It.IsAnyType>(),
            It.IsAny<Exception>(),
            It.IsAny<Func<It.IsAnyType, Exception?, string>>()), Times.Once);
    }

    [Fact]
    public async Task Handle_ScoresIdenticalWithAndWithoutEngine()
    {
        // G1: the same state instance comes back whether the engine does nothing or throws.
        var quiet = new Mock<IQuestEngine>();
        quiet.Setup(e => e.EvaluateAsync(It.IsAny<Guid>(), It.IsAny<ScoringSnapshot>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<QuestCompletion>());
        var failing = new Mock<IQuestEngine>();
        failing.Setup(e => e.EvaluateAsync(It.IsAny<Guid>(), It.IsAny<ScoringSnapshot>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("x"));

        var withQuiet = await new RecalculateJourneyCommandHandler(_scoring.Object, quiet.Object, _logger.Object)
            .Handle(new RecalculateJourneyCommand(UserId), CancellationToken.None);
        var withFailing = await new RecalculateJourneyCommandHandler(_scoring.Object, failing.Object, _logger.Object)
            .Handle(new RecalculateJourneyCommand(UserId), CancellationToken.None);

        Assert.Same(State, withQuiet);
        Assert.Same(State, withFailing);
        quiet.Verify(e => e.EvaluateAsync(UserId, Snapshot, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_CallsScoringExactlyOnce()
    {
        _engine.Setup(e => e.EvaluateAsync(It.IsAny<Guid>(), It.IsAny<ScoringSnapshot>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<QuestCompletion>());

        await Handler().Handle(new RecalculateJourneyCommand(UserId), CancellationToken.None);

        _scoring.Verify(s => s.RecalculateWithSnapshotAsync(UserId, It.IsAny<CancellationToken>()), Times.Once);
        _scoring.Verify(s => s.RecalculateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
