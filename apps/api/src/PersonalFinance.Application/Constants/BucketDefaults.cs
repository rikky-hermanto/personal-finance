namespace PersonalFinance.Application.Constants;

/// <summary>
/// Buckets budgeting thresholds. Source: docs/features/budgeting/buckets-build-plan.md and
/// docs/features/budgeting/budgeting-3-kantong-review.md (CIO/UX guardrails), per FIN-02 — no
/// magic thresholds without a cited source.
/// </summary>
public static class BucketDefaults
{
    /// <summary>Month-to-month variation above which a committed item or category is flagged `watch` (inferred, not certain). Build plan Ticket 2.</summary>
    public const decimal WatchVariancePct = 0.30m;

    /// <summary>Proposed Free below this fraction of the user's Free median triggers the soft-floor warning. UX review, blocking finding #2.</summary>
    public const decimal SoftFloorPct = 0.80m;

    /// <summary>Trailing 3-month income variation above which the daily allowance switches off in favour of a durability/runway figure. Build plan Ticket 2, `daily` + variable income row.</summary>
    public const decimal VariableIncomeThresholdPct = 0.25m;

    /// <summary>Day of month at which the state machine may switch from `daily` to `forecast` pace-projection (only if the 7-day pace also projects over). Build plan Ticket 2 state table.</summary>
    public const int ForecastDay = 26;

    /// <summary>Trailing days used to compute the forecast pace.</summary>
    public const int ForecastPaceWindowDays = 7;

    /// <summary>Emergency fund target, in months of essential (Committed) spend — the low end of the 3–6 month range. docs/reference/finance-domain/formulas.md.</summary>
    public const int EmergencyFundTargetMonths = 3;

    /// <summary>Minimum trailing months of transaction data before Buckets leaves `learning` state.</summary>
    public const int MinMonthsForDaily = 2;

    /// <summary>Day of month through which the just-closed month's reconciliation (`close` state) is shown.</summary>
    public const int MonthCloseWindowDays = 2;
}
