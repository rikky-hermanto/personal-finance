using System.Globalization;

namespace PersonalFinance.Application.Quests;

public static class StarRungs
{
    // Source: docs/ideas/scoring-rubric.md. 70 is the level-graduation bar ("cleared"); 50 and 100
    // are the rubric's mid and full breakpoint scores. Stars are recognition, not points.
    public static readonly IReadOnlyList<decimal> Scores = [50m, 70m, 100m];

    public sealed record StarIndicator(string Code, string Level, decimal[] RawAtRung, Func<decimal, string> Copy);

    // RawAtRung is the raw value that earns score 50/70/100, from the same breakpoints as the
    // Score* formulas in JourneyScoringService. StarRungsTests proves the two cannot drift.
    public static readonly IReadOnlyList<StarIndicator> Indicators =
    [
        new("spend_lt_income",      "L1", [0.95m, 0.89m, 0.80m], r => $"Spending under {Pct(r)} of income"),
        new("liquid_savings_ratio", "L2", [1.5m, 2.1m, 3.0m],    r => $"{r.ToString("0.0", CultureInfo.InvariantCulture)} months of expenses saved"),
        new("manageable_dti",       "L2", [0.36m, 0.296m, 0.20m], r => $"Debt payments under {Pct(r)} of income"),
        new("savings_rate",         "L3", [0.05m, 0.09m, 0.15m], r => $"Setting aside {Pct(r)} of income"),
    ];

    public static int StarsFor(string code, decimal score, string status)
    {
        if (status == "no_data" || Indicators.All(i => i.Code != code)) return 0;
        return Scores.Count(threshold => score >= threshold);
    }

    public static string RungCopy(string code, int rung)
    {
        var indicator = Indicators.First(i => i.Code == code);
        return indicator.Copy(indicator.RawAtRung[rung - 1]);
    }

    private static string Pct(decimal ratio) =>
        (ratio * 100m).ToString("0.#", CultureInfo.InvariantCulture) + "%";
}
