namespace PersonalFinance.Application.Quests;

public static class ValuationFreshness
{
    /// <summary>G6: a fence post needs every savings balance that counts to be dated in the current or the
    /// previous calendar month. Accounts with no valuation contribute nothing to cover, so they do not block.
    /// At least one valuation must exist.</summary>
    public static bool AllFresh(IReadOnlyList<SavingsAccountFact> savings, DateOnly today)
    {
        var dated = savings.Where(a => a.LatestValuedAt.HasValue).ToList();
        if (dated.Count == 0) return false;
        var oldestAllowed = new DateTime(today.Year, today.Month, 1).AddMonths(-1);
        return dated.All(a => a.LatestValuedAt!.Value >= oldestAllowed);
    }
}
