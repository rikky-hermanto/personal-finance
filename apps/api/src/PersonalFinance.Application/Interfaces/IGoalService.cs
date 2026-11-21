using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Interfaces;

/// <summary>Supabase-backed persistence for goals and their child rows (PF-154). Every call runs under the
/// caller's token, so RLS scopes every read and write to the owner.</summary>
public interface IGoalService
{
    Task<(IReadOnlyList<Goal> Items, int Total)> ListAsync(
        string? kind, IReadOnlyCollection<string> statuses, int page, int pageSize, CancellationToken ct = default);

    Task<Goal?> GetAsync(Guid id, CancellationToken ct = default);
    Task<Goal> InsertAsync(Goal goal, CancellationToken ct = default);
    Task<Goal?> UpdateAsync(Goal goal, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct = default);

    /// <summary>The owner's highest color_index + 1, or 0 when there are no goals.</summary>
    Task<short> NextColorIndexAsync(CancellationToken ct = default);

    /// <summary>Contributions for every goal in the set, in one query.</summary>
    Task<IReadOnlyList<GoalContribution>> ContributionsForAsync(IReadOnlyList<Guid> goalIds, CancellationToken ct = default);

    Task<(IReadOnlyList<GoalContribution> Items, int Total)> ContributionPageAsync(
        Guid goalId, int page, int pageSize, CancellationToken ct = default);

    Task<GoalContribution> InsertContributionAsync(GoalContribution contribution, CancellationToken ct = default);
    Task<bool> DeleteContributionAsync(Guid goalId, Guid id, CancellationToken ct = default);

    /// <summary>Cost items for every goal in the set, in one query.</summary>
    Task<IReadOnlyList<GoalCostItem>> CostItemsForAsync(IReadOnlyList<Guid> goalIds, CancellationToken ct = default);

    /// <summary>Delete the goal's cost items, then insert the new set.</summary>
    Task<IReadOnlyList<GoalCostItem>> ReplaceCostItemsAsync(
        Guid goalId, IReadOnlyList<GoalCostItem> items, CancellationToken ct = default);

    /// <summary>Σ amount of contributions of active or paused goals held in any of these accounts.</summary>
    Task<decimal> EarmarkedInAccountsAsync(IReadOnlyCollection<Guid> accountIds, CancellationToken ct = default);

    /// <summary>True when the caller can see this account (RLS). Used to reject another owner's account id.</summary>
    Task<bool> AccountVisibleAsync(Guid accountId, CancellationToken ct = default);
}
