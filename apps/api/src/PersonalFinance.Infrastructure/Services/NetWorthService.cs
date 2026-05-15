using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static global::Supabase.Postgrest.Constants;

namespace PersonalFinance.Infrastructure.Services;

public class NetWorthService(
    global::Supabase.Client supabase,
    ILogger<NetWorthService> logger
) : INetWorthService
{
    public async Task<decimal> GetCurrentNetWorthIdrAsync(CancellationToken ct = default)
    {
        logger.LogDebug("Computing current net worth");

        var accounts = await supabase.From<Account>().Filter("is_active", Operator.Equals, "true").Get();
        var assets = await supabase.From<Asset>().Get();
        var liabilities = await supabase.From<Liability>().Get();
        var valuations = await supabase.From<Valuation>().Get();

        var latestBySubject = valuations.Models
            .GroupBy(v => (v.SubjectType, v.SubjectId))
            .ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.ValuedAt).First().ValueIdr);

        decimal totalAssets = 0;
        foreach (var account in accounts.Models)
        {
            if (latestBySubject.TryGetValue(("account", account.Id), out var val))
                totalAssets += val;
            else
                totalAssets += account.OpeningBalance;
        }

        foreach (var asset in assets.Models)
        {
            if (latestBySubject.TryGetValue(("asset", asset.Id), out var val))
                totalAssets += val;
        }

        decimal totalLiabilities = liabilities.Models.Sum(l => l.Principal);

        var netWorth = totalAssets - totalLiabilities;
        logger.LogInformation("Net worth computed: {NetWorth} IDR (assets={TotalAssets}, liabilities={TotalLiabilities})",
            netWorth, totalAssets, totalLiabilities);

        return netWorth;
    }

    public async Task<IReadOnlyDictionary<string, decimal>> GetAllocationByClassAsync(CancellationToken ct = default)
    {
        logger.LogDebug("Computing allocation by asset class");

        var assets = await supabase.From<Asset>().Get();
        var valuations = await supabase.From<Valuation>()
            .Filter("subject_type", Operator.Equals, "asset")
            .Get();

        var latestByAsset = valuations.Models
            .GroupBy(v => v.SubjectId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.ValuedAt).First().ValueIdr);

        var allocation = new Dictionary<string, decimal>();
        foreach (var asset in assets.Models)
        {
            if (!latestByAsset.TryGetValue(asset.Id, out var val)) continue;
            allocation.TryGetValue(asset.AssetClass, out var existing);
            allocation[asset.AssetClass] = existing + val;
        }

        return allocation;
    }

    public async Task<IReadOnlyList<(DateTime Date, decimal ValueIdr)>> GetHistoryAsync(
        DateTime from, DateTime to, CancellationToken ct = default)
    {
        logger.LogDebug("Getting net worth history from {From} to {To}", from, to);

        var valuations = await supabase.From<Valuation>()
            .Filter("valued_at", Operator.GreaterThanOrEqual, from.ToString("O"))
            .Filter("valued_at", Operator.LessThanOrEqual, to.ToString("O"))
            .Order("valued_at", Ordering.Ascending)
            .Get();

        var liabilities = await supabase.From<Liability>().Get();
        var totalLiabilities = liabilities.Models.Sum(l => l.Principal);

        // Group by date (day-level buckets) and sum all subject values
        var byDate = valuations.Models
            .GroupBy(v => v.ValuedAt.Date)
            .Select(g => (Date: g.Key, ValueIdr: g.Sum(v => v.ValueIdr) - totalLiabilities))
            .OrderBy(x => x.Date)
            .ToList();

        return byDate;
    }
}
