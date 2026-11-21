using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;

namespace PersonalFinance.Application.Goals;

public sealed record FoundationInputs(
    IndicatorScoreDto? Spend, IndicatorScoreDto? Cover, IndicatorScoreDto? Dti,
    bool SavingsFresh, decimal LiquidTotal, decimal AvgMonthlyConsumption, decimal EarmarkedInSavings,
    decimal AvgMonthlyIncome, decimal MonthlyDebtService);

public sealed record FoundationCheck(
    string State, decimal? CoverMonthsAfterEarmarks, decimal EarmarkedInSavings, decimal? CurrentDti,
    IReadOnlyList<string> Failing, IReadOnlyList<string> Missing);

public sealed record GoalGate(string State, decimal? PostPurchaseDti, IReadOnlyList<string> Failing, IReadOnlyList<string> Missing);

/// <summary>Source: formulas.md §9 "Foundation check". Bars are the live scoring functions at the rubric's
/// Cleared bar (70), never copied thresholds. Green only when every input was evaluated (FIN-04).</summary>
public static class FoundationGate
{
    // Source: scoring-rubric.md "Cleared = every live indicator scores at least 70".
    private const decimal ClearedBar = 70m;

    public static FoundationCheck Evaluate(FoundationInputs i)
    {
        var failing = new List<string>();
        var missing = new List<string>();

        if (i.Spend is null || i.Spend.Status == "no_data") missing.Add("spend_lt_income");
        else if (i.Spend.Score < ClearedBar) failing.Add("spend_lt_income");

        decimal? cover = null;
        if (i.Cover is null || i.Cover.Status == "no_data" || i.AvgMonthlyConsumption <= 0m) missing.Add("liquid_savings_ratio");
        else if (!i.SavingsFresh) missing.Add("savings_stale");
        else
        {
            var earmarked = Math.Min(i.EarmarkedInSavings, i.LiquidTotal);
            cover = Math.Round((i.LiquidTotal - earmarked) / i.AvgMonthlyConsumption, 2, MidpointRounding.ToZero);
            if (JourneyScoringService.ScoreLiquidSavings(cover.Value) < ClearedBar) failing.Add("cover_after_earmarks");
        }

        decimal? dti = null;
        if (i.Dti is null || i.Dti.Status == "no_data") missing.Add("manageable_dti");
        else { dti = i.Dti.RawValue; if (i.Dti.Score < ClearedBar) failing.Add("manageable_dti"); }

        return new FoundationCheck(StateFor(failing, missing), cover, i.EarmarkedInSavings, dti, failing, missing);
    }

    public static GoalGate ForGoal(FoundationCheck f, FoundationInputs i, decimal? plannedInstalment)
    {
        var failing = f.Failing.ToList();
        var missing = f.Missing.ToList();
        decimal? post = null;
        if (plannedInstalment is { } inst && inst > 0m)
        {
            if (f.CurrentDti is null || i.AvgMonthlyIncome <= 0m) missing.Add("post_purchase_dti");
            else
            {
                post = Math.Round((i.MonthlyDebtService + inst) / i.AvgMonthlyIncome, 4, MidpointRounding.AwayFromZero);
                if (JourneyScoringService.ScoreDti(post.Value) < ClearedBar) failing.Add("post_purchase_dti");
            }
        }
        return new GoalGate(StateFor(failing, missing), post, failing, missing);
    }

    private static string StateFor(List<string> failing, List<string> missing) =>
        failing.Count > 0 ? "not_recommended_yet" : missing.Count > 0 ? "not_evaluated" : "clear";
}
