namespace PersonalFinance.Application.Quests;

public sealed record RungResult(int Rung, bool Met, IReadOnlyDictionary<string, object?> Evidence);
public sealed record QuestProgress(int Done, int Total, string Label, decimal Fraction);

/// <summary>A detector: a pure function of the context. No database, no clock, no randomness.</summary>
public abstract record QuestRule
{
    protected static readonly IReadOnlyDictionary<string, object?> NoEvidence = new Dictionary<string, object?>();

    public abstract IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest);

    /// <summary>False when the quest cannot be pursued yet (for example, there are no accounts to cover).</summary>
    public virtual bool Applies(QuestContext ctx) => true;

    /// <summary>Board progress from stored values only. Null for single-step quests.</summary>
    public virtual QuestProgress? Progress(QuestContext ctx, QuestDefinition quest) => null;

    protected static int DoneRungs(QuestContext ctx, string code) =>
        ctx.Completed.Where(c => c.Code == code).Select(c => c.Rung).DefaultIfEmpty(0).Max();
}
