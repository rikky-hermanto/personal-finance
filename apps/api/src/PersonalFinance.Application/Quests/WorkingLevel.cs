namespace PersonalFinance.Application.Quests;

public static class WorkingLevel
{
    private static readonly string[] Levels = ["L1", "L2", "L3", "L4", "L5"];

    /// <summary>A level is cleared when it has at least one live indicator and every live one scores 70 or more
    /// (scoring-rubric.md, Level Graduation Rules). The working level is the first level not cleared.
    /// This is NOT currentLevel, which reads 1 both before and after L1 clears (CIO guardrail G7).
    /// An untrusted indicator (G6, stale input) never counts as clearing a level.</summary>
    public static (string Working, IReadOnlySet<string> Cleared) Compute(IEnumerable<IndicatorFact> indicators)
    {
        var list = indicators.ToList();
        var cleared = new HashSet<string>();
        foreach (var level in Levels)
        {
            var live = list.Where(i => i.Level == level && i.Status != "no_data").ToList();
            if (live.Count > 0 && live.All(i => i.Trusted && i.Score >= 70m)) cleared.Add(level); else break;
        }
        var working = Levels.FirstOrDefault(l => !cleared.Contains(l)) ?? "L5";
        return (working, cleared);
    }
}
