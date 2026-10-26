using PersonalFinance.Application.Quests;

namespace PersonalFinance.Tests.Quests;

/// <summary>Plain-object QuestContext for rule tests. Defaults: everything loaded, nothing recorded.</summary>
internal static class ContextBuilder
{
    public static readonly DateOnly Today = new(2026, 10, 25);

    public static QuestContext Empty() => new(
        Today,
        new Dictionary<string, IndicatorFact>(),
        "L1",
        new HashSet<string>(),
        [],
        false,
        [],
        [],
        0,
        false,
        true,
        true,
        new HashSet<(string, int)>());

    public static QuestContext WithIndicator(this QuestContext ctx, IndicatorFact fact)
    {
        var map = new Dictionary<string, IndicatorFact>(ctx.Indicators) { [fact.Code] = fact };
        return ctx with { Indicators = map };
    }

    public static QuestContext WithMonths(this QuestContext ctx, params MonthFacts[] months) =>
        ctx with { Months = months };

    public static QuestContext WithCompleted(this QuestContext ctx, params (string, int)[] completed) =>
        ctx with { Completed = completed.ToHashSet() };

    public static MonthFacts Month(int year, int month, decimal income, decimal expense, params ExpenseFact[] top) =>
        new(year, month, income, expense, top);

    public static IndicatorFact Cover(decimal raw, bool trusted = true, decimal score = 50m) =>
        new("liquid_savings_ratio", "L2", score, raw, "in_progress", trusted);
}
