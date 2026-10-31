using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Services.Harvest;

/// <summary>
/// Counts consecutive harvested months. One missing month between two harvested months is
/// forgiven once per calendar quarter; any other gap starts a new run quietly.
/// Product rule: plans/brainstorms/pm-journey-quests-analysis.md (Ritual quest type).
/// </summary>
public static class MonthlyRhythm
{
    public static RhythmDto Compute(IEnumerable<DateOnly> harvestedMonths, DateOnly lastFullMonth)
    {
        var last = FirstOfMonth(lastFullMonth);
        var months = harvestedMonths
            .Select(FirstOfMonth)
            .Where(m => m <= last)
            .Distinct()
            .OrderBy(m => m)
            .ToList();
        if (months.Count == 0) return new RhythmDto(0, 0);

        var run = 0;
        var longest = 0;
        var skipsUsed = new HashSet<(int Year, int Quarter)>();
        DateOnly? previous = null;

        foreach (var month in months)
        {
            if (previous is null)
            {
                run = 1;
            }
            else
            {
                var missing = MonthsBetween(previous.Value, month) - 1;
                if (missing == 0)
                {
                    run++;
                }
                else if (missing == 1 && skipsUsed.Add(QuarterOf(previous.Value.AddMonths(1))))
                {
                    run++; // the skipped month itself is not counted
                }
                else
                {
                    run = 1;
                    skipsUsed.Clear();
                }
            }
            longest = Math.Max(longest, run);
            previous = month;
        }

        // Two or more finished months without a harvest: the run has ended. Nothing is shown about it.
        var current = MonthsBetween(months[^1], last) >= 2 ? 0 : run;
        return new RhythmDto(current, longest);
    }

    private static DateOnly FirstOfMonth(DateOnly d) => new(d.Year, d.Month, 1);

    private static int MonthsBetween(DateOnly from, DateOnly to) =>
        (to.Year - from.Year) * 12 + (to.Month - from.Month);

    private static (int Year, int Quarter) QuarterOf(DateOnly d) => (d.Year, (d.Month - 1) / 3 + 1);
}
