namespace PersonalFinance.Application.Goals;

/// <summary>Allowed values; mirror the CHECK constraints in 20261109000000_pf_154_goals.sql.</summary>
public static class GoalKinds
{
    public const string BigPurchase = "big_purchase";
    public static readonly IReadOnlyDictionary<string, string> TierFor = new Dictionary<string, string>
    {
        [BigPurchase] = "L3", ["emergency_fund"] = "L2", ["fire"] = "L4",
    };
    public static readonly IReadOnlySet<string> BigPurchaseCategories =
        new HashSet<string> { "house_land", "vehicle", "education", "wedding", "other" };
    public static readonly IReadOnlySet<string> Statuses =
        new HashSet<string> { "active", "paused", "achieved", "cancelled" };
    /// <summary>Status groups behind the Plans and Achieved tabs (`status=open` / `status=closed`).</summary>
    public static readonly IReadOnlyList<string> OpenStatuses = ["active", "paused"];
    public static readonly IReadOnlyList<string> ClosedStatuses = ["achieved", "cancelled"];
    public static readonly IReadOnlySet<string> CostItemTypes =
        new HashSet<string> { "purchase_price", "down_payment", "loan_principal", "tax", "fee", "other" };
    /// <summary>The only cost line that is borrowed rather than saved for. Cash needed = every other line.</summary>
    public const string FinancedItemType = "loan_principal";
}
