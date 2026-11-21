namespace PersonalFinance.Application.Goals;

/// <summary>Input bounds for goal writes. Storage limits, not financial thresholds.</summary>
public static class GoalRules
{
    // Source: numeric(20,2) in 20261109000000_pf_154_goals.sql holds at most 18 integer digits.
    public const decimal MaxAmount = 1_000_000_000_000_000_000m;
    // Source: CHECK constraints in 20261109000000_pf_154_goals.sql.
    public const int NameMaxLength = 120;
    public const int NotesMaxLength = 2000;
    public const int ContributionNoteMaxLength = 280;
    public const int CostLabelMaxLength = 80;
    // Source: PF-154 STEP 10 validator bound (a breakdown is a handful of lines).
    public const int MaxCostItems = 20;
}
