using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Constants;
using PersonalFinance.Application.Dtos.Desk;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities.Desk;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Services.Desk;

public class DeskService(Supabase.Client supabase, ILogger<DeskService> logger) : IDeskService
{
    // Placeholder user_id until PF-S08 (Supabase Auth) lands — matches the all-zeros convention
    // used across every other table pre-auth. RLS is permissive (`USING (true)`), so this filter
    // is the only actual data-isolation mechanism in this phase; never omit it.
    private static readonly Guid PlaceholderUserId = Guid.Empty;

    public async Task<DeskStateDto> GetStateAsync()
    {
        logger.LogDebug("Assembling desk state for user {UserId}", PlaceholderUserId);

        var accountsResult = await supabase.From<DeskBrokerAccount>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Get();
        var positionsResult = await supabase.From<DeskPosition>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Order("symbol", Ordering.Ascending)
            .Get();
        var reconResult = await supabase.From<DeskReconIssue>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Get();
        var journalResult = await supabase.From<DeskJournalEntry>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Order("trade_date", Ordering.Ascending)
            .Get();
        var openTradesResult = await supabase.From<DeskOpenTrade>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Get();
        var mandateVersionsResult = await supabase.From<DeskMandateVersion>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Order("version", Ordering.Descending)
            .Get();

        var accounts = accountsResult.Models.Select(DeskMappers.ToDto).ToList();
        var positions = positionsResult.Models.Select(DeskMappers.ToDto).ToList();
        var reconIssues = reconResult.Models.Select(DeskMappers.ToDto).ToList();
        var journal = journalResult.Models.Select(DeskMappers.ToDto).ToList();
        var mandateVersions = mandateVersionsResult.Models.Select(DeskMappers.ToDto).ToList();

        var activeMandate = mandateVersions.FirstOrDefault(m => m.Status == "approved");
        var mandateParams = activeMandate?.Params ?? DeskDefaults.MandateDefault;

        var reconciledNav = accounts.Sum(a => a.ReportedEquity);
        var legacyMv = positions.Where(p => p.Sleeve == "Legacy / Unclassified").Sum(p => p.MvIdr);
        var openRisk = openTradesResult.Models.Sum(t => t.InitialRisk);

        var asOfDate = TodayWib();
        var todaysRealizedPnl = journal.Where(j => j.TradeDate == asOfDate).Sum(j => j.NetPnl);

        var navChainInput = new NavChainInputDto(
            TentativeNav: reconciledNav,
            ReconciledNav: reconciledNav,
            LegacyMv: legacyMv,
            OpenRisk: openRisk,
            TodaysRealizedPnl: todaysRealizedPnl,
            DrawdownRegime: DeskDefaults.DefaultRegime, // regime modeling (equity-curve drawdown) is not built in Phase 1
            Mandate: mandateParams
        );

        var chain = DeskCalculator.ComputeNavChain(navChainInput);
        var journalStats = DeskCalculator.ComputeJournalStats(journal);
        var aggregatedPositions = DeskCalculator.AggregateBySymbol(positions);
        // No Pre-Trade screen exists yet (PF-134) — the desk-wide gate always evaluates with a null plan.
        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, null, null, mandateParams, journalStats, journal, aggregatedPositions, asOfDate));

        return new DeskStateDto(
            Accounts: accounts,
            Positions: positions,
            ReconIssues: reconIssues,
            Journal: journal,
            MandateVersions: mandateVersions,
            ActiveMandate: activeMandate,
            NavChain: chain,
            Gate: gate,
            JournalStats: journalStats,
            DrawdownRegime: DeskDefaults.DefaultRegime
        );
    }

    public async Task<DeskPositionDto> SetPositionSleeveAsync(Guid positionId, string sleeve)
    {
        logger.LogInformation("Setting sleeve for position {PositionId} to {Sleeve}", positionId, sleeve);

        var result = await supabase.From<DeskPosition>()
            .Filter("id", Operator.Equals, positionId.ToString())
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Get();
        var position = result.Models.FirstOrDefault()
            ?? throw new KeyNotFoundException($"Desk position {positionId} not found.");

        position.Sleeve = sleeve;
        position.UpdatedAt = DateTime.UtcNow;

        var updated = await supabase.From<DeskPosition>().Update(position);
        return DeskMappers.ToDto(updated.Models.First());
    }

    public async Task<DeskReconIssueDto> ResolveReconIssueAsync(Guid issueId, string resolution)
    {
        logger.LogInformation("Resolving recon issue {IssueId} as {Resolution}", issueId, resolution);

        var result = await supabase.From<DeskReconIssue>()
            .Filter("id", Operator.Equals, issueId.ToString())
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Get();
        var issue = result.Models.FirstOrDefault()
            ?? throw new KeyNotFoundException($"Desk recon issue {issueId} not found.");

        issue.Resolution = resolution;
        issue.ResolvedAt = DateTime.UtcNow;
        issue.UpdatedAt = DateTime.UtcNow;

        var updated = await supabase.From<DeskReconIssue>().Update(issue);
        return DeskMappers.ToDto(updated.Models.First());
    }

    private static DateOnly TodayWib() => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
}
