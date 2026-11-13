using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Services;

/// <summary>
/// Net worth = Σ assets − Σ liabilities (docs/references/finance-domain/formulas.md, "Net worth").
/// Assets are active accounts, valued assets and valued holdings, each at its latest valuation.
/// The current figure and every history point go through the same method, so they agree.
/// </summary>
public static class NetWorthCalculator
{
    // Liquid = can be turned into cash within a few days. Same split the Assets pages use:
    // every account except credit cards and loans (frontend lib/accounts.ts accountGroup),
    // every holding, and the asset classes PropertiesTab does not list as non-liquid.
    private static readonly HashSet<string> LiquidAccountTypes = ["checking", "savings", "brokerage", "wallet"];
    private static readonly HashSet<string> LiquidAssetClasses = ["cash", "investments", "crypto"];

    public static NetWorthSummaryDto Summarize(
        IReadOnlyCollection<Account> accounts,
        IReadOnlyCollection<Asset> assets,
        IReadOnlyCollection<Holding> holdings,
        IReadOnlyCollection<Liability> liabilities,
        IEnumerable<Valuation> valuations)
    {
        var latest = valuations
            .GroupBy(v => (v.SubjectType, v.SubjectId))
            .ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.ValuedAt).First().ValueIdr);

        return SummarizeAsOf(accounts, assets, holdings, liabilities, latest, asOf: null);
    }

    /// <summary>
    /// One point per day in [from, to] that has a valuation. Each point carries every subject's
    /// latest value forward, so checking in one account does not drop the others from that day.
    /// Liabilities have no history yet, so every point uses today's principal.
    /// </summary>
    public static IReadOnlyList<NetWorthPointDto> History(
        IReadOnlyCollection<Account> accounts,
        IReadOnlyCollection<Asset> assets,
        IReadOnlyCollection<Holding> holdings,
        IReadOnlyCollection<Liability> liabilities,
        IEnumerable<Valuation> valuations,
        DateTime from,
        DateTime to)
    {
        var latest = new Dictionary<(string, Guid), decimal>();
        var points = new List<NetWorthPointDto>();

        var days = valuations
            .Where(v => v.ValuedAt <= to)
            .OrderBy(v => v.ValuedAt)
            .GroupBy(v => v.ValuedAt.Date);

        foreach (var day in days)
        {
            foreach (var v in day)
                latest[(v.SubjectType, v.SubjectId)] = v.ValueIdr;

            if (day.Key < from.Date) continue;

            var s = SummarizeAsOf(accounts, assets, holdings, liabilities, latest, asOf: day.Key);
            points.Add(new NetWorthPointDto(day.Key, s.NetWorthIdr, s.AssetsIdr, s.LiabilitiesIdr));
        }

        return points;
    }

    // asOf = null means "now": an account with no valuation counts at its opening balance.
    // For a past day, it counts only once it was opened.
    private static NetWorthSummaryDto SummarizeAsOf(
        IReadOnlyCollection<Account> accounts,
        IReadOnlyCollection<Asset> assets,
        IReadOnlyCollection<Holding> holdings,
        IReadOnlyCollection<Liability> liabilities,
        IReadOnlyDictionary<(string, Guid), decimal> latest,
        DateTime? asOf)
    {
        decimal totalAssets = 0;
        decimal liquid = 0;

        foreach (var account in accounts.Where(a => a.IsActive))
        {
            decimal value;
            if (latest.TryGetValue(("account", account.Id), out var val))
                value = val;
            else if (asOf is null || account.OpeningDate.Date <= asOf.Value)
                value = account.OpeningBalance;
            else
                continue;

            totalAssets += value;
            if (LiquidAccountTypes.Contains(account.AccountType)) liquid += value;
        }

        foreach (var asset in assets)
        {
            if (!latest.TryGetValue(("asset", asset.Id), out var val)) continue;
            totalAssets += val;
            if (LiquidAssetClasses.Contains(asset.AssetClass)) liquid += val;
        }

        foreach (var holding in holdings)
        {
            if (!latest.TryGetValue(("holding", holding.Id), out var val)) continue;
            totalAssets += val;
            liquid += val;
        }

        var totalLiabilities = liabilities.Sum(l => l.Principal);

        return new NetWorthSummaryDto(totalAssets - totalLiabilities, totalAssets, totalLiabilities, liquid);
    }
}
