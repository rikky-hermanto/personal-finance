using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Services;

/// <summary>
/// Pure Journey scoring rules: no Supabase, no clock. Kept apart from JourneyScoringService so
/// every rule can be tested with plain objects. Methodology: docs/ideas/scoring-rubric.md (v2).
/// </summary>
internal static class JourneyScoringRules
{
    // Source: docs/ideas/scoring-rubric.md v2, "Spending vs saving". These categories mean money
    // moved to the future rather than consumed. spend_lt_income and liquid_savings_ratio leave them
    // out of expense; savings_rate counts only them. Only "Investment" is produced by a preset today.
    private static readonly HashSet<string> SavingsCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "Investment", "Savings Transfer", "Investasi", "Tabungan",
    };

    // Source: CHECK constraint on public.accounts.account_type (20260515000001_assets_management.sql) allows only lowercase values.
    internal const string SavingsAccountType = "savings";

    // Source: CHECK constraint on public.valuations.subject_type (20260515000001_assets_management.sql) allows only lowercase values.
    internal const string AccountValuationSubjectType = "account";

    public static bool IsExpense(Transaction t) =>
        t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase);

    public static bool IsIncome(Transaction t) =>
        t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase);

    private static bool IsSavingsCategory(Transaction t) =>
        SavingsCategories.Contains(t.Category?.Trim() ?? string.Empty);

    /// <summary>Money spent on living: an Expense row outside the savings categories.</summary>
    public static bool IsConsumption(Transaction t) => IsExpense(t) && !IsSavingsCategory(t);

    /// <summary>Money moved to saving or investing: an Expense row inside the savings categories.</summary>
    public static bool IsSavingsOutflow(Transaction t) => IsExpense(t) && IsSavingsCategory(t);

    public static decimal MonthTotal(
        IEnumerable<Transaction> transactions, DateTime month, Func<Transaction, bool> include) =>
        transactions
            .Where(t => t.Date.Year == month.Year && t.Date.Month == month.Month && include(t))
            .Sum(t => t.AmountIdr);

    /// <summary>Consumption ÷ income for each month that has income; months without income have no ratio.</summary>
    public static List<decimal> MonthlyConsumptionRatios(
        IEnumerable<Transaction> transactions, IEnumerable<DateTime> months)
    {
        var all = transactions.ToList();
        return months
            .Select(m => (Income: MonthTotal(all, m, IsIncome), Consumption: MonthTotal(all, m, IsConsumption)))
            .Where(x => x.Income > 0)
            .Select(x => x.Consumption / x.Income)
            .ToList();
    }

    public static decimal AverageMonthlyIncome(IEnumerable<Transaction> transactions, IEnumerable<DateTime> months) =>
        AverageMonthly(transactions, months, IsIncome);

    public static decimal AverageMonthlyConsumption(IEnumerable<Transaction> transactions, IEnumerable<DateTime> months) =>
        AverageMonthly(transactions, months, IsConsumption);

    public static decimal AverageMonthlySavingsOutflow(IEnumerable<Transaction> transactions, IEnumerable<DateTime> months) =>
        AverageMonthly(transactions, months, IsSavingsOutflow);

    // A month with no rows counts as zero, exactly as the service did before PF-151.
    // Known follow-up (CIO): this overstates cover when months are missing. See Notes.
    private static decimal AverageMonthly(
        IEnumerable<Transaction> transactions, IEnumerable<DateTime> months, Func<Transaction, bool> include)
    {
        var all = transactions.ToList();
        return months.Select(m => MonthTotal(all, m, include)).DefaultIfEmpty(0m).Average();
    }

    /// <summary>Result of DTI evaluation: either a ratio, or the reason it is not evaluated.</summary>
    internal readonly record struct DtiOutcome(decimal? Dti, string? NotEvaluatedReason);

    /// <summary>
    /// manageable_dti is evaluated only when the app has debt information: at least one recorded
    /// liability (which always overrides the confirmation), or the owner's "I have no debts"
    /// confirmation. With neither, it is "not evaluated" (FIN-04), never a perfect score.
    /// Income is take-home income seen in bank statements, so DTI reads higher than the gross-income
    /// convention in formulas.md §1 (conservative).
    /// A liability with no monthly_payment means the debt service is unknown, never zero: the
    /// indicator is not evaluated and names the liability that needs a payment (CIO Q4). This holds
    /// even when "no debts" is confirmed, and matters because achievements are never revoked: an
    /// unknown must not be able to score 100. A payment the owner entered as 0 is known.
    /// </summary>
    public static DtiOutcome EvaluateDti(
        IReadOnlyCollection<Liability> liabilities, DateTime? noDebtsConfirmedAt, decimal avgMonthlyIncome)
    {
        if (liabilities.Count == 0 && noDebtsConfirmedAt is null)
            return new DtiOutcome(null, "No debts recorded and none confirmed");

        var missingPayment = liabilities.FirstOrDefault(l => !l.MonthlyPayment.HasValue);
        if (missingPayment is not null)
            return new DtiOutcome(null, $"Add the monthly payment for {missingPayment.Name} to evaluate debt");

        if (avgMonthlyIncome <= 0)
            return new DtiOutcome(null, "No income data to compute DTI");

        var monthlyDebtService = liabilities.Sum(l => l.MonthlyPayment!.Value);

        return new DtiOutcome(monthlyDebtService / avgMonthlyIncome, null);
    }

    /// <summary>
    /// Achievements the current indicators earn. An indicator that is not evaluated (no_data)
    /// never earns anything, and a level with no live indicator is never cleared (FIN-04).
    /// </summary>
    public static List<string> AchievementsEarned(IReadOnlyCollection<IndicatorScoreDto> indicators)
    {
        var earned = new List<string>();

        IndicatorScoreDto? Live(string code) =>
            indicators.FirstOrDefault(i => i.Code == code && i.Status != "no_data");

        if (Live("spend_lt_income")?.Score >= 70) earned.Add("positive_cashflow_3mo");
        if (Live("liquid_savings_ratio")?.Score >= 100) earned.Add("emergency_ready");
        if (Live("manageable_dti")?.Score >= 100) earned.Add("debt_free");
        if (Live("savings_rate")?.Score >= 70) earned.Add("consistent_investor");

        foreach (var (level, code) in new[] { ("L1", "graduated_l1"), ("L2", "graduated_l2"), ("L3", "graduated_l3") })
        {
            var live = indicators.Where(i => i.Level == level && i.Status != "no_data").ToList();
            if (live.Count > 0 && live.All(i => i.Score >= 70)) earned.Add(code);
        }

        return earned;
    }

    internal sealed record IndicatorDefinition(
        string Code, string Level, string DisplayName, string Description, bool HasDataSource);

    // One place for each indicator's level and label. RecalculateAsync (fresh scores) and
    // BuildIndicatorDtos (scores rebuilt from storage) both read this, so they cannot disagree.
    public static readonly IReadOnlyList<IndicatorDefinition> Definitions =
    [
        new("spend_lt_income", "L1", "Spend less than income",
            "3-month rolling average of spending (excluding money you saved or invested) vs. income", true),
        new("pay_bills_on_time", "L1", "Pay bills on time", "Bill due-date tracking not yet available", false),
        new("liquid_savings_ratio", "L2", "Liquid savings ratio",
            "Emergency fund in months of average monthly spending (excluding money you saved or invested)", true),
        new("manageable_dti", "L2", "Manageable debt (DTI)", "Monthly debt payments as % of take-home income", true),
        // G11: protection belongs to Defense. A hospital bill without cover empties the emergency fund.
        new("appropriate_insurance", "L2", "Appropriate insurance", "Insurance module not yet available", false),
        new("savings_rate", "L3", "Long-term savings rate", "Investment contributions as % of monthly income", true),
        new("prime_credit", "L3", "Prime credit score", "Credit bureau integration not yet available", false),
        new("passive_income", "L4", "Passive income coverage", "Dividend/yield tracker not yet available", false),
    ];

    /// <summary>Scores worth storing: indicators that were evaluated. Unevaluated ones are left out.</summary>
    public static Dictionary<string, decimal> LiveScoreMap(IEnumerable<IndicatorScoreDto> indicators) =>
        indicators.Where(i => i.Status != "no_data").ToDictionary(i => i.Code, i => i.Score);
}
