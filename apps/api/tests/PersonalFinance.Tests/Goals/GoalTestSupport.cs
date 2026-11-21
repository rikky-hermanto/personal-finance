using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Tests.Goals;

/// <summary>Shared fixtures for the PF-154 goal tests. Synthetic goals and amounts only.</summary>
internal static class GoalTestSupport
{
    public static readonly Guid Owner = Guid.Parse("15400000-0000-0000-0000-0000000000a1");
    public static readonly DateOnly Today = new(2026, 11, 9);

    /// <summary>Pins "today" to 2026-11-09 in a UTC local zone.</summary>
    public sealed class FixedTime() : AppTimeProvider(TimeZoneInfo.Utc)
    {
        public override DateTimeOffset GetUtcNow() => new(2026, 11, 9, 5, 0, 0, TimeSpan.Zero);
    }

    public static Mock<ICurrentUser> Caller()
    {
        var caller = new Mock<ICurrentUser>();
        caller.SetupGet(c => c.UserId).Returns(Owner);
        return caller;
    }

    public static Goal Goal(
        string name = "Test vehicle", decimal target = 200_000_000m, DateOnly? date = null,
        string status = "active", string category = "vehicle", short colour = 0) => new()
        {
            Id = Guid.NewGuid(),
            UserId = Owner,
            Kind = GoalKinds.BigPurchase,
            Tier = "L3",
            Category = category,
            Name = name,
            Priority = 2,
            TargetAmount = target,
            TargetDate = date is { } d ? GoalProjection.ToStoredDate(d) : null,
            Status = status,
            ColorIndex = colour,
        };

    public static GoalContribution Contribution(Guid goalId, decimal amount, DateOnly? on = null) => new()
    {
        Id = Guid.NewGuid(),
        UserId = Owner,
        GoalId = goalId,
        Amount = amount,
        ContributedOn = GoalProjection.ToStoredDate(on ?? new DateOnly(2026, 11, 1)),
    };

    public static FoundationResult ClearFoundation()
    {
        var spend = new IndicatorScoreDto("spend_lt_income", "L1", 100m, 0.68m, "achieved", "Spend", "Spend");
        var cover = new IndicatorScoreDto("liquid_savings_ratio", "L2", 100m, 3m, "achieved", "Cover", "Cover");
        var dti = new IndicatorScoreDto("manageable_dti", "L2", 100m, 0.1m, "achieved", "DTI", "DTI");
        var inputs = new FoundationInputs(spend, cover, dti, true, 30_000_000m, 10_000_000m, 0m, 15_000_000m, 1_500_000m);
        return new FoundationResult(inputs, FoundationGate.Evaluate(inputs));
    }

    public static Mock<IFoundationCheckService> FoundationMock()
    {
        var f = new Mock<IFoundationCheckService>();
        f.Setup(x => x.EvaluateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(ClearFoundation());
        return f;
    }

    public static Mock<IGoalService> GoalServiceMock()
    {
        var g = new Mock<IGoalService>();
        g.Setup(x => x.ContributionsForAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<GoalContribution>());
        g.Setup(x => x.CostItemsForAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<GoalCostItem>());
        return g;
    }

    public static NullLogger<T> Log<T>() => NullLogger<T>.Instance;
}
