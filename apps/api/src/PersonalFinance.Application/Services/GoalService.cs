using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Goals;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using Supabase.Postgrest.Interfaces;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Services;

/// <summary>Goals persistence through PostgREST (PF-154). The per-request client carries the caller's token,
/// so RLS scopes every query; owner ids on insert are set by the handlers from ICurrentUser.</summary>
public class GoalService(
    Supabase.Client supabase,
    ILogger<GoalService> logger
) : IGoalService
{
    public async Task<(IReadOnlyList<Goal> Items, int Total)> ListAsync(
        string? kind, IReadOnlyCollection<string> statuses, int page, int pageSize, CancellationToken ct = default)
    {
        var total = await Filtered(kind, statuses).Count(CountType.Exact, ct);
        var from = (page - 1) * pageSize;
        if (total == 0 || from >= total) return (Array.Empty<Goal>(), total);

        var result = await Filtered(kind, statuses)
            .Order("priority", Ordering.Ascending)
            .Order("target_date", Ordering.Ascending, NullPosition.Last)
            .Order("created_at", Ordering.Ascending)
            .Range(from, from + pageSize - 1)
            .Get(ct);

        logger.LogDebug("Listed {Count} of {Total} goals", result.Models.Count, total);
        return (result.Models, total);
    }

    // A fresh builder per call: the count and the page query must not share filter state.
    private IPostgrestTable<Goal> Filtered(string? kind, IReadOnlyCollection<string> statuses)
    {
        IPostgrestTable<Goal> q = supabase.From<Goal>();
        if (!string.IsNullOrEmpty(kind)) q = q.Filter("kind", Operator.Equals, kind);
        if (statuses.Count > 0) q = q.Filter("status", Operator.In, statuses.Cast<object>().ToList());
        return q;
    }

    public async Task<Goal?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var result = await supabase.From<Goal>().Filter("id", Operator.Equals, id.ToString()).Get(ct);
        return result.Models.FirstOrDefault();
    }

    public async Task<Goal> InsertAsync(Goal goal, CancellationToken ct = default)
    {
        var result = await supabase.From<Goal>().Insert(goal, cancellationToken: ct);
        var inserted = result.Models.First();
        logger.LogInformation("Goal created with ID: {Id}", inserted.Id);
        return inserted;
    }

    public async Task<Goal?> UpdateAsync(Goal goal, CancellationToken ct = default)
    {
        goal.TargetDate = GoalProjection.PinCalendarDate(goal.TargetDate);
        var result = await supabase.From<Goal>()
            .Filter("id", Operator.Equals, goal.Id.ToString())
            .Update(goal, cancellationToken: ct);
        return result.Models.FirstOrDefault();
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        if (await GetAsync(id, ct) is null) return false;
        await supabase.From<Goal>().Filter("id", Operator.Equals, id.ToString()).Delete(cancellationToken: ct);
        logger.LogInformation("Goal {Id} deleted", id);
        return true;
    }

    public async Task<short> NextColorIndexAsync(CancellationToken ct = default)
    {
        var result = await supabase.From<Goal>()
            .Order("color_index", Ordering.Descending)
            .Range(0, 0)
            .Get(ct);
        return result.Models.Count == 0 ? (short)0 : (short)(result.Models[0].ColorIndex + 1);
    }

    public async Task<IReadOnlyList<GoalContribution>> ContributionsForAsync(
        IReadOnlyList<Guid> goalIds, CancellationToken ct = default)
    {
        if (goalIds.Count == 0) return Array.Empty<GoalContribution>();
        var result = await supabase.From<GoalContribution>()
            .Filter("goal_id", Operator.In, goalIds.Select(g => (object)g.ToString()).ToList())
            .Get(ct);
        return result.Models;
    }

    public async Task<(IReadOnlyList<GoalContribution> Items, int Total)> ContributionPageAsync(
        Guid goalId, int page, int pageSize, CancellationToken ct = default)
    {
        var total = await supabase.From<GoalContribution>()
            .Filter("goal_id", Operator.Equals, goalId.ToString())
            .Count(CountType.Exact, ct);
        var from = (page - 1) * pageSize;
        if (total == 0 || from >= total) return (Array.Empty<GoalContribution>(), total);

        var result = await supabase.From<GoalContribution>()
            .Filter("goal_id", Operator.Equals, goalId.ToString())
            .Order("contributed_on", Ordering.Descending)
            .Order("created_at", Ordering.Descending)
            .Range(from, from + pageSize - 1)
            .Get(ct);
        return (result.Models, total);
    }

    public async Task<GoalContribution> InsertContributionAsync(GoalContribution contribution, CancellationToken ct = default)
    {
        var result = await supabase.From<GoalContribution>().Insert(contribution, cancellationToken: ct);
        var inserted = result.Models.First();
        logger.LogInformation("Contribution {Id} recorded for goal {GoalId}", inserted.Id, inserted.GoalId);
        return inserted;
    }

    public async Task<bool> DeleteContributionAsync(Guid goalId, Guid id, CancellationToken ct = default)
    {
        var existing = await supabase.From<GoalContribution>()
            .Filter("id", Operator.Equals, id.ToString())
            .Filter("goal_id", Operator.Equals, goalId.ToString())
            .Get(ct);
        if (existing.Models.Count == 0) return false;

        await supabase.From<GoalContribution>()
            .Filter("id", Operator.Equals, id.ToString())
            .Filter("goal_id", Operator.Equals, goalId.ToString())
            .Delete(cancellationToken: ct);
        logger.LogInformation("Contribution {Id} deleted from goal {GoalId}", id, goalId);
        return true;
    }

    public async Task<IReadOnlyList<GoalCostItem>> CostItemsForAsync(IReadOnlyList<Guid> goalIds, CancellationToken ct = default)
    {
        if (goalIds.Count == 0) return Array.Empty<GoalCostItem>();
        var result = await supabase.From<GoalCostItem>()
            .Filter("goal_id", Operator.In, goalIds.Select(g => (object)g.ToString()).ToList())
            .Order("sort_order", Ordering.Ascending)
            .Get(ct);
        return result.Models;
    }

    public async Task<IReadOnlyList<GoalCostItem>> ReplaceCostItemsAsync(
        Guid goalId, IReadOnlyList<GoalCostItem> items, CancellationToken ct = default)
    {
        await supabase.From<GoalCostItem>()
            .Filter("goal_id", Operator.Equals, goalId.ToString())
            .Delete(cancellationToken: ct);
        if (items.Count == 0) return Array.Empty<GoalCostItem>();

        var result = await supabase.From<GoalCostItem>().Insert(items.ToList(), cancellationToken: ct);
        logger.LogInformation("Replaced cost items for goal {GoalId}: {Count} rows", goalId, result.Models.Count);
        return result.Models;
    }

    public async Task<decimal> EarmarkedInAccountsAsync(IReadOnlyCollection<Guid> accountIds, CancellationToken ct = default)
    {
        if (accountIds.Count == 0) return 0m;

        var rows = (await supabase.From<GoalContribution>()
            .Filter("held_in_account_id", Operator.In, accountIds.Select(a => (object)a.ToString()).ToList())
            .Get(ct)).Models;
        if (rows.Count == 0) return 0m;

        var openGoalIds = (await supabase.From<Goal>()
            .Filter("id", Operator.In, rows.Select(r => (object)r.GoalId.ToString()).Distinct().ToList())
            .Filter("status", Operator.In, GoalKinds.OpenStatuses.Cast<object>().ToList())
            .Get(ct)).Models.Select(g => g.Id).ToHashSet();

        return rows.Where(r => openGoalIds.Contains(r.GoalId)).Sum(r => r.Amount);
    }

    public async Task<bool> AccountVisibleAsync(Guid accountId, CancellationToken ct = default)
    {
        var result = await supabase.From<Account>().Filter("id", Operator.Equals, accountId.ToString()).Get(ct);
        return result.Models.Count > 0;
    }
}
