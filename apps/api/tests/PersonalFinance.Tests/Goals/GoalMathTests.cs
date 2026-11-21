using PersonalFinance.Application.Goals;

namespace PersonalFinance.Tests.Goals;

// Synthetic amounts only (PF-154 compliance change 6). Every case maps to formulas.md §9.
public class GoalMathTests
{
    private static readonly DateOnly Today = new(2026, 11, 9);

    [Fact]
    public void Compute_NoTargetDate_NoDateTimelineNoMonthly()
    {
        // Act
        var p = GoalMath.Compute(500_000_000m, 0m, null, null, Today);

        // Assert
        Assert.Equal("no_date", p.Timeline);
        Assert.Null(p.MonthlyNeeded);
        Assert.Null(p.MonthsLeft);
        Assert.Equal(500_000_000m, p.Remaining);
    }

    [Fact]
    public void Compute_TwentyFourMonthsLeft_StraightLine()
    {
        // Act
        var p = GoalMath.Compute(300_000_000m, 0m, new DateOnly(2028, 11, 9), null, Today);

        // Assert
        Assert.Equal(24, p.MonthsLeft);
        Assert.Equal(12_500_000m, p.MonthlyNeeded);
        Assert.Equal("scheduled", p.Timeline);
    }

    [Fact]
    public void Compute_UnevenDivision_RoundsUpToWholeRupiah()
    {
        // Act
        var p = GoalMath.Compute(100m, 0m, new DateOnly(2027, 2, 9), null, Today);

        // Assert
        Assert.Equal(3, p.MonthsLeft);
        Assert.Equal(34m, p.MonthlyNeeded);
    }

    [Fact]
    public void Compute_TargetDayBeforeToday_CountsOneLessMonth()
    {
        // Act
        var p = GoalMath.Compute(1_000_000m, 0m, new DateOnly(2026, 12, 5), null, Today);

        // Assert
        Assert.Equal(0, p.MonthsLeft);
        Assert.Equal("due_soon", p.Timeline);
        Assert.Null(p.MonthlyNeeded);
    }

    [Fact]
    public void Compute_TargetInPast_Overdue()
    {
        // Act
        var p = GoalMath.Compute(1_000_000m, 250_000m, new DateOnly(2026, 10, 1), null, Today);

        // Assert
        Assert.Equal("overdue", p.Timeline);
        Assert.Null(p.MonthlyNeeded);
        Assert.Equal(750_000m, p.Remaining);
        Assert.True(p.MonthsLeft < 0);
    }

    [Fact]
    public void Compute_OverFunded_SurplusAndPercentAbove100()
    {
        // Act
        var p = GoalMath.Compute(100m, 120m, new DateOnly(2027, 11, 9), null, Today);

        // Assert
        Assert.Equal(120.0m, p.PercentComplete);
        Assert.Equal(20m, p.Surplus);
        Assert.Equal(0m, p.Remaining);
        Assert.Equal("funded", p.Timeline);
        Assert.Null(p.MonthlyNeeded);
    }

    [Fact]
    public void Compute_ZeroAllocated_ZeroPercentFullRemaining()
    {
        // Act
        var p = GoalMath.Compute(200_000_000m, 0m, new DateOnly(2028, 11, 9), null, Today);

        // Assert
        Assert.Equal(0m, p.PercentComplete);
        Assert.Equal(200_000_000m, p.Remaining);
        Assert.Equal(0m, p.Surplus);
        Assert.Equal(8_333_334m, p.MonthlyNeeded);
    }

    [Fact]
    public void Compute_NearlyFunded_PercentTruncatesBelow100()
    {
        // Act
        var p = GoalMath.Compute(10_000m, 9_999.6m, null, null, Today);

        // Assert
        Assert.Equal(99.9m, p.PercentComplete);
        Assert.Equal(0.4m, p.Remaining);
    }

    [Fact]
    public void GrowthFactor_TwoYearsSixMonths_AnnualPlusLinear()
    {
        // Act
        var factor = GoalMath.GrowthFactor(0.05m, 30);

        // Assert
        Assert.Equal(1.13006250m, factor);
    }

    [Fact]
    public void Compute_WithGrowthRate_RaisesEffectiveTarget()
    {
        // Act: 24 months at 5% a year, so the target grows by 1.05^2 = 1.1025
        var p = GoalMath.Compute(100_000_000m, 0m, new DateOnly(2028, 11, 9), 0.05m, Today);

        // Assert
        Assert.Equal(110_250_000m, p.EffectiveTarget);
        Assert.Equal(4_593_750m, p.MonthlyNeeded);
    }

    [Fact]
    public void Compute_GrowthWithPastDate_UsesTodayTarget()
    {
        // Act
        var p = GoalMath.Compute(100_000_000m, 0m, new DateOnly(2026, 10, 1), 0.05m, Today);

        // Assert
        Assert.Equal(100_000_000m, p.EffectiveTarget);
        Assert.Equal("overdue", p.Timeline);
    }

    [Fact]
    public void Pace_LessThanThreeMonthsHistory_Null()
    {
        // Arrange: the first contribution is last month, inside the 3-month window
        var rows = new List<(DateOnly, decimal)> { (new DateOnly(2026, 10, 15), 5_000_000m) };

        // Act
        var pace = GoalMath.Pace(rows, 10_000_000m, Today);

        // Assert
        Assert.Null(pace.PerMonth);
        Assert.Null(pace.ReachMonth);
    }

    [Fact]
    public void Pace_NetWithdrawals_Null()
    {
        // Arrange
        var rows = new List<(DateOnly, decimal)>
        {
            (new DateOnly(2026, 6, 1), 10_000_000m),
            (new DateOnly(2026, 9, 1), -3_000_000m),
        };

        // Act
        var pace = GoalMath.Pace(rows, 10_000_000m, Today);

        // Assert
        Assert.Null(pace.PerMonth);
    }

    [Fact]
    public void Pace_Normal_ReachMonth()
    {
        // Arrange
        var rows = new List<(DateOnly, decimal)>
        {
            (new DateOnly(2026, 7, 20), 1_000_000m),
            (new DateOnly(2026, 8, 5), 8_000_000m),
            (new DateOnly(2026, 9, 5), 8_000_000m),
            (new DateOnly(2026, 10, 5), 8_000_000m),
        };

        // Act
        var pace = GoalMath.Pace(rows, 40_000_000m, Today);

        // Assert
        Assert.Equal(8_000_000m, pace.PerMonth);
        Assert.Equal(new DateOnly(2027, 4, 1), pace.ReachMonth);
        Assert.False(pace.BeyondCap);
    }

    [Fact]
    public void Pace_ThisMonthContribution_NotCounted()
    {
        // Arrange: only complete months count, so this month's entry is ignored
        var rows = new List<(DateOnly, decimal)>
        {
            (new DateOnly(2026, 7, 20), 3_000_000m),
            (new DateOnly(2026, 11, 2), 9_000_000m),
        };

        // Act
        var pace = GoalMath.Pace(rows, 40_000_000m, Today);

        // Assert
        Assert.Null(pace.PerMonth);
    }

    [Fact]
    public void Pace_BeyondCap_FlagsBeyondCap()
    {
        // Arrange: Rp 1 a month across the window
        var rows = new List<(DateOnly, decimal)>
        {
            (new DateOnly(2026, 6, 1), 1m),
            (new DateOnly(2026, 8, 1), 1m),
            (new DateOnly(2026, 9, 1), 1m),
            (new DateOnly(2026, 10, 1), 1m),
        };

        // Act
        var pace = GoalMath.Pace(rows, 1_000_000_000_000_000m, Today);

        // Assert
        Assert.Equal(1m, pace.PerMonth);
        Assert.True(pace.BeyondCap);
        Assert.Null(pace.ReachMonth);
    }
}

public class GoalProjectionDateTests
{
    [Fact]
    public void PinCalendarDate_LocalMidnightReadBack_KeepsCalendarDayAsUtc()
    {
        // Arrange: how a `date` column comes back from PostgREST on a UTC+7 host
        var readBack = new DateTime(2028, 11, 30, 0, 0, 0, DateTimeKind.Local);

        // Act
        var pinned = PersonalFinance.Application.Goals.GoalProjection.PinCalendarDate(readBack);

        // Assert
        Assert.Equal(DateTimeKind.Utc, pinned!.Value.Kind);
        Assert.Equal(new DateTime(2028, 11, 30, 0, 0, 0, DateTimeKind.Utc), pinned.Value);
        Assert.Equal("2028-11-30", pinned.Value.ToUniversalTime().ToString("yyyy-MM-dd"));
    }

    [Fact]
    public void PinCalendarDate_Null_StaysNull() =>
        Assert.Null(PersonalFinance.Application.Goals.GoalProjection.PinCalendarDate(null));
}
