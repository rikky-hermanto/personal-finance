using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using static global::Supabase.Postgrest.Constants;

namespace PersonalFinance.Infrastructure.Services;

public class NetWorthService(
    global::Supabase.Client supabase,
    ILogger<NetWorthService> logger
) : INetWorthService
{
    public async Task<NetWorthSummaryDto> GetCurrentAsync(CancellationToken ct = default)
    {
        logger.LogDebug("Computing current net worth");

        var (accounts, assets, holdings, liabilities) = await LoadBalanceSheetAsync();
        var valuations = await supabase.From<Valuation>().Get();

        var summary = NetWorthCalculator.Summarize(accounts, assets, holdings, liabilities, valuations.Models);
        logger.LogInformation("Net worth computed: {NetWorth} IDR (assets={TotalAssets}, liabilities={TotalLiabilities}, liquid={Liquid})",
            summary.NetWorthIdr, summary.AssetsIdr, summary.LiabilitiesIdr, summary.LiquidIdr);

        return summary;
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

    public async Task<IReadOnlyList<NetWorthPointDto>> GetHistoryAsync(
        DateTime from, DateTime to, CancellationToken ct = default)
    {
        logger.LogDebug("Getting net worth history from {From} to {To}", from, to);

        var (accounts, assets, holdings, liabilities) = await LoadBalanceSheetAsync();

        // Valuations before `from` are needed too: each point carries the latest value forward.
        var valuations = await supabase.From<Valuation>()
            .Filter("valued_at", Operator.LessThanOrEqual, to.ToString("O"))
            .Order("valued_at", Ordering.Ascending)
            .Get();

        return NetWorthCalculator.History(accounts, assets, holdings, liabilities, valuations.Models, from, to);
    }

    private async Task<(List<Account> Accounts, List<Asset> Assets, List<Holding> Holdings, List<Liability> Liabilities)>
        LoadBalanceSheetAsync()
    {
        var accounts = await supabase.From<Account>().Get();
        var assets = await supabase.From<Asset>().Get();
        var holdings = await supabase.From<Holding>().Get();
        var liabilities = await supabase.From<Liability>().Get();
        return (accounts.Models, assets.Models, holdings.Models, liabilities.Models);
    }
}
