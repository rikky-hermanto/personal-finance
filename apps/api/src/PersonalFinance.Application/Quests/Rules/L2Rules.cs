using System.Globalization;

namespace PersonalFinance.Application.Quests;

public sealed record DebtsMapped : QuestRule
{
    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest)
    {
        var evidence = new Dictionary<string, object?>
        {
            ["liabilities"] = ctx.LiabilityCount,
            ["confirmedNoDebts"] = ctx.NoDebtsConfirmed,
        };
        return [new RungResult(0, ctx.LiabilityCount >= 1 || ctx.NoDebtsConfirmed, evidence)];
    }
}

public sealed record ValuationExists(string AccountType) : QuestRule
{
    // v1 supports savings only; SavingsAccounts is the only list the snapshot loads.
    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest)
    {
        var met = ctx.SavingsLoaded && ctx.SavingsAccounts.Any(a => a.LatestValuedAt != null);
        // The reveal line "You are covered for N months" needs the cover figure. Store it only when the
        // indicator is live and trusted; otherwise no line appears, rather than an invented one.
        var coverLive = ctx.SavingsLoaded && ctx.Indicators.TryGetValue("liquid_savings_ratio", out var ind)
            && ind.Status != "no_data" && ind.Trusted && ind.Raw is not null;
        IReadOnlyDictionary<string, object?> evidence = coverLive
            ? new Dictionary<string, object?> { ["months"] = ctx.Indicators["liquid_savings_ratio"].Raw }
            : NoEvidence;
        return [new RungResult(0, met, evidence)];
    }
}

public sealed record LevelGraduated(string Level) : QuestRule
{
    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest) =>
        [new RungResult(0, ctx.GraduatedLevels.Contains(Level), new Dictionary<string, object?> { ["level"] = Level })];
}

public sealed record RawValueAtLeast(string IndicatorCode, string StepNoun, string ValueUnit) : QuestRule
{
    private static decimal? RawOf(QuestContext ctx, string code) =>
        ctx.Indicators.TryGetValue(code, out var ind) && ind.Status != "no_data" && ind.Trusted ? ind.Raw : null;

    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest)
    {
        var raw = ctx.SavingsLoaded ? RawOf(ctx, IndicatorCode) : null;
        var valuedAt = ctx.SavingsAccounts.Where(a => a.LatestValuedAt.HasValue)
            .Select(a => a.LatestValuedAt!.Value).DefaultIfEmpty().Max();
        var evidence = new Dictionary<string, object?>
        {
            ["months"] = raw?.ToString(CultureInfo.InvariantCulture),
            ["valuedAt"] = valuedAt == default ? null : valuedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        };
        return quest.Rungs
            .Select((threshold, i) => new RungResult(i + 1, raw is not null && raw >= threshold, evidence))
            .ToList();
    }

    public override QuestProgress? Progress(QuestContext ctx, QuestDefinition quest)
    {
        var raw = RawOf(ctx, IndicatorCode);
        var total = quest.Rungs.Count;
        var done = Math.Min(DoneRungs(ctx, quest.Code), total);
        var label = $"{done} of {total} {StepNoun}";
        if (raw is not null) label += $" · {raw.Value.ToString("0.0", CultureInfo.InvariantCulture)} {ValueUnit}";
        decimal fraction;
        if (done >= total) fraction = 1m;
        else if (raw is null) fraction = 0m;
        else
        {
            var prev = done == 0 ? 0m : quest.Rungs[done - 1];
            var next = quest.Rungs[done];
            fraction = Math.Clamp((raw.Value - prev) / (next - prev), 0m, 1m);
        }
        return new QuestProgress(done, total, label, fraction);
    }
}

public sealed record IndicatorScoreAtLeast(string IndicatorCode) : QuestRule
{
    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest)
    {
        ctx.Indicators.TryGetValue(IndicatorCode, out var ind);
        var live = ind is not null && ind.Status != "no_data" && ind.Trusted;
        var evidence = new Dictionary<string, object?>
        {
            ["score"] = live ? ind!.Score.ToString(CultureInfo.InvariantCulture) : null,
            ["raw"] = live ? ind!.Raw?.ToString(CultureInfo.InvariantCulture) : null,
        };
        return quest.Rungs
            .Select((threshold, i) => new RungResult(i + 1, live && ind!.Score >= threshold, evidence))
            .ToList();
    }
}
