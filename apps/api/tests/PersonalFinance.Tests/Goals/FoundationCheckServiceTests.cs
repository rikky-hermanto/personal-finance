using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Quests;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using static PersonalFinance.Tests.Goals.GoalTestSupport;

namespace PersonalFinance.Tests.Goals;

public class FoundationCheckServiceTests
{
    private readonly Mock<IJourneyScoringService> _scoring = new();
    private readonly Mock<IGoalService> _goals = GoalServiceMock();

    private FoundationCheckService Service() => new(_scoring.Object, _goals.Object, Log<FoundationCheckService>());

    [Fact]
    public async Task EvaluateAsync_SnapshotThrows_NotEvaluatedNeverClear()
    {
        // Arrange
        _scoring.Setup(s => s.LoadSnapshotAsync(Owner, It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException("boom"));

        // Act
        var result = await Service().EvaluateAsync(Owner);

        // Assert
        Assert.Equal("not_evaluated", result.Check.State);
        Assert.Equal(["computation_error"], result.Check.Missing);
    }

    [Fact]
    public async Task EvaluateAsync_SubtractsEarmarksFromSavingsCover()
    {
        // Arrange: 30M in fresh savings, 10M monthly consumption, 12M earmarked leaves 1.8 months
        var account = Guid.NewGuid();
        var income = new Transaction { Date = new DateTime(2026, 10, 5), Flow = "CR", Type = "Income", AmountIdr = 20_000_000m, Category = "Salary" };
        var spend = new Transaction { Date = new DateTime(2026, 10, 6), Flow = "DB", Type = "Expense", AmountIdr = 30_000_000m, Category = "Food" };
        var snapshot = new ScoringSnapshot(Today, [income, spend],
            [new SavingsAccountFact(account, "Savings", 30_000_000m, new DateTime(2026, 11, 1))], [], null, true,
            [
                new IndicatorScoreDto("spend_lt_income", "L1", 100m, 0.5m, "achieved", "s", "s"),
                new IndicatorScoreDto("liquid_savings_ratio", "L2", 100m, 3m, "achieved", "c", "c"),
                new IndicatorScoreDto("manageable_dti", "L2", 100m, 0m, "achieved", "d", "d"),
            ]);
        _scoring.Setup(s => s.LoadSnapshotAsync(Owner, It.IsAny<CancellationToken>())).ReturnsAsync(snapshot);
        _goals.Setup(g => g.EarmarkedInAccountsAsync(It.Is<IReadOnlyCollection<Guid>>(ids => ids.Contains(account)), It.IsAny<CancellationToken>()))
            .ReturnsAsync(12_000_000m);

        // Act
        var result = await Service().EvaluateAsync(Owner);

        // Assert
        Assert.Equal(30_000_000m, result.Inputs.LiquidTotal);
        Assert.Equal(12_000_000m, result.Check.EarmarkedInSavings);
        Assert.True(result.Inputs.AvgMonthlyConsumption > 0m);
        Assert.Equal(
            Math.Round((30_000_000m - 12_000_000m) / result.Inputs.AvgMonthlyConsumption, 2, MidpointRounding.ToZero),
            result.Check.CoverMonthsAfterEarmarks);
    }
}
