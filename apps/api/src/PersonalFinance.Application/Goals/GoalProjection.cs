using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Goals;

/// <summary>Maps stored goal rows to DTOs through GoalMath and FoundationGate (PF-154). The only place derived
/// goal numbers are produced, so the list, the detail and every write response agree.</summary>
public static class GoalProjection
{
    public static DateOnly? ToDate(DateTime? value) => value is { } v ? DateOnly.FromDateTime(v) : null;

    public static DateTime ToStoredDate(DateOnly value) => value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

    /// <summary>A `date` column read back through PostgREST arrives as local midnight; written back as is, the
    /// client converts it to UTC and Asia/Jakarta (UTC+7) loses a day. Pin it to UTC midnight of the same
    /// calendar date before any update.</summary>
    public static DateTime? PinCalendarDate(DateTime? value) =>
        value is { } v ? DateTime.SpecifyKind(v.Date, DateTimeKind.Utc) : null;

    /// <summary>Cash needed = every cost line except the loan principal (borrowed, not saved for).</summary>
    public static decimal CashNeeded(IEnumerable<(string ItemType, decimal Amount)> items) =>
        items.Where(i => i.ItemType != GoalKinds.FinancedItemType).Sum(i => i.Amount);

    public static GoalDto ToDto(
        Goal g, IEnumerable<GoalContribution> contributions, IEnumerable<GoalCostItem> costItems,
        FoundationResult? foundation, DateOnly today)
    {
        var rows = contributions.Where(c => c.GoalId == g.Id)
            .Select(c => (On: DateOnly.FromDateTime(c.ContributedOn), c.Amount)).ToList();
        var costs = costItems.Where(c => c.GoalId == g.Id).OrderBy(c => c.SortOrder).ToList();

        var allocated = rows.Sum(r => r.Amount);
        var progress = GoalMath.Compute(g.TargetAmount, allocated, ToDate(g.TargetDate), g.PriceGrowthRate, today);
        var pace = GoalMath.Pace(rows, progress.Remaining, today);
        var gate = g.Kind == GoalKinds.BigPurchase && foundation is not null
            ? FoundationGate.ForGoal(foundation.Check, foundation.Inputs, g.PlannedMonthlyInstalment)
            : null;

        return new GoalDto
        {
            Id = g.Id,
            Kind = g.Kind,
            Tier = g.Tier,
            Category = g.Category,
            Name = g.Name,
            Notes = g.Notes,
            Priority = g.Priority,
            Recurrence = g.Recurrence,
            Status = g.Status,
            AchievedAt = g.AchievedAt,
            ColorIndex = g.ColorIndex,
            TargetAmount = g.TargetAmount,
            EffectiveTarget = progress.EffectiveTarget,
            TotalCost = costs.Count > 0 ? costs.Sum(c => c.Amount) : null,
            Allocated = progress.Allocated,
            Remaining = progress.Remaining,
            Surplus = progress.Surplus,
            PercentComplete = progress.PercentComplete,
            MonthlyNeeded = progress.MonthlyNeeded,
            PriceGrowthRate = g.PriceGrowthRate,
            PlannedMonthlyInstalment = g.PlannedMonthlyInstalment,
            PacePerMonth = pace.PerMonth,
            PostPurchaseDti = gate?.PostPurchaseDti,
            TargetDate = ToDate(g.TargetDate),
            MonthsLeft = progress.MonthsLeft,
            Timeline = progress.Timeline,
            PaceReachMonth = pace.ReachMonth?.ToString("yyyy-MM"),
            PaceBeyondCap = pace.BeyondCap,
            GateState = gate?.State,
            GateFailing = gate?.Failing ?? [],
            GateMissing = gate?.Missing ?? [],
            CostItems = costs.Select(c => new GoalCostItemDto(c.Id, c.ItemType, c.Label, c.Amount, c.SortOrder)).ToList(),
        };
    }

    public static FoundationCheckDto ToDto(FoundationResult f) => new()
    {
        State = f.Check.State,
        SpendRatio = f.Inputs.Spend is { Status: not "no_data" } s ? s.RawValue : null,
        CoverMonthsAfterEarmarks = f.Check.CoverMonthsAfterEarmarks,
        EarmarkedInSavings = f.Check.EarmarkedInSavings,
        CurrentDti = f.Check.CurrentDti,
        Failing = f.Check.Failing,
        Missing = f.Check.Missing,
    };

    /// <summary>The Monthly plan card over every open goal. Only overdue goals count as past due; a due-soon goal
    /// shows its lump sum on its own card. Paused goals get a bar segment but no monthly amount.</summary>
    public static GoalPlanSummaryDto Summary(IReadOnlyList<GoalDto> openGoals)
    {
        var active = openGoals.Where(g => g.Status == "active").ToList();
        var scheduled = active.Where(g => g.Timeline == "scheduled").ToList();
        var overdue = active.Where(g => g.Timeline == "overdue").ToList();
        var segments = openGoals.Where(g => g.Status is "active" or "paused").ToList();
        var targetSum = segments.Sum(g => g.EffectiveTarget);

        return new GoalPlanSummaryDto
        {
            MonthlyTotal = scheduled.Sum(g => g.MonthlyNeeded ?? 0m),
            ScheduledCount = scheduled.Count,
            OverdueRemaining = overdue.Sum(g => g.Remaining),
            OverdueGoalNames = overdue.Select(g => g.Name).ToList(),
            Segments = segments.Select(g => new GoalPlanSegmentDto
            {
                GoalId = g.Id,
                Name = g.Name,
                ColorIndex = g.ColorIndex,
                Allocated = g.Allocated,
                EffectiveTarget = g.EffectiveTarget,
                PercentComplete = g.PercentComplete,
                BarShare = targetSum > 0m
                    ? Math.Round(g.EffectiveTarget / targetSum * 100m, 2, MidpointRounding.AwayFromZero)
                    : 0m,
            }).ToList(),
        };
    }

    /// <summary>Load the ledger, cost items and foundation for one goal and map it. Used by the detail read and
    /// every write that returns a goal.</summary>
    public static async Task<GoalDto> LoadOneAsync(
        Goal goal, IGoalService goals, IFoundationCheckService foundation, Guid userId, DateOnly today,
        CancellationToken ct)
    {
        var ids = new[] { goal.Id };
        var contributions = await goals.ContributionsForAsync(ids, ct);
        var costs = await goals.CostItemsForAsync(ids, ct);
        var check = goal.Kind == GoalKinds.BigPurchase ? await foundation.EvaluateAsync(userId, ct) : null;
        return ToDto(goal, contributions, costs, check, today);
    }

    public static DateOnly Today(TimeProvider time) => DateOnly.FromDateTime(time.GetLocalNow().DateTime);
}
