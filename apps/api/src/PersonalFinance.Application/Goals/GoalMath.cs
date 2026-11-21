namespace PersonalFinance.Application.Goals;

public sealed record GoalProgress(
    decimal Allocated, decimal EffectiveTarget, decimal Remaining, decimal Surplus, decimal PercentComplete,
    int? MonthsLeft, decimal? MonthlyNeeded, string Timeline);

public sealed record GoalPace(decimal? PerMonth, DateOnly? ReachMonth, bool BeyondCap);

/// <summary>Source: docs/references/finance-domain/formulas.md §9 Goal funding. Every line below maps to a row there.</summary>
public static class GoalMath
{
    // Source: formulas.md §9 "Reach month": display cap, not a finance threshold.
    internal const int PaceCapMonths = 600;

    public static int MonthsLeft(DateOnly today, DateOnly target)
    {
        var months = (target.Year - today.Year) * 12 + (target.Month - today.Month);
        return target.Day < today.Day ? months - 1 : months;
    }

    public static decimal GrowthFactor(decimal annualRate, int months)
    {
        if (months <= 0 || annualRate == 0m) return 1m;
        var factor = 1m;
        for (var y = 0; y < months / 12; y++) factor *= 1m + annualRate;
        return factor * (1m + annualRate * (months % 12) / 12m);
    }

    public static GoalProgress Compute(
        decimal target, decimal allocated, DateOnly? targetDate, decimal? growthRate, DateOnly today)
    {
        int? monthsLeft = targetDate is { } d ? MonthsLeft(today, d) : null;
        var effective = growthRate is { } g && monthsLeft is >= 1
            ? Math.Round(target * GrowthFactor(g, monthsLeft.Value), 2, MidpointRounding.AwayFromZero)
            : target;
        var remaining = Math.Max(effective - allocated, 0m);
        var surplus = Math.Max(allocated - effective, 0m);
        var percent = Math.Round(allocated / effective * 100m, 1, MidpointRounding.ToZero);

        string timeline;
        decimal? monthly = null;
        if (remaining == 0m) timeline = "funded";
        else if (targetDate is null) timeline = "no_date";
        else if (targetDate.Value < today) timeline = "overdue";
        else if (monthsLeft < 1) timeline = "due_soon";
        else { timeline = "scheduled"; monthly = Math.Ceiling(remaining / monthsLeft!.Value); }

        return new GoalProgress(allocated, effective, remaining, surplus, percent, monthsLeft, monthly, timeline);
    }

    public static GoalPace Pace(IReadOnlyList<(DateOnly On, decimal Amount)> contributions, decimal remaining, DateOnly today)
    {
        var thisMonth = new DateOnly(today.Year, today.Month, 1);
        var windowStart = thisMonth.AddMonths(-3);
        if (contributions.Count == 0 || contributions.Min(c => c.On) >= windowStart) return new(null, null, false);

        var perMonth = Math.Round(
            contributions.Where(c => c.On >= windowStart && c.On < thisMonth).Sum(c => c.Amount) / 3m,
            2, MidpointRounding.AwayFromZero);
        if (perMonth <= 0m) return new(null, null, false);
        if (remaining <= 0m) return new(perMonth, null, false);

        var months = Math.Ceiling(remaining / perMonth);
        return months > PaceCapMonths
            ? new(perMonth, null, true)
            : new(perMonth, thisMonth.AddMonths((int)months), false);
    }
}
