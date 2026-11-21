using System.Text.Json.Serialization;

namespace PersonalFinance.Application.Dtos;

/// <summary>FIN-01: money and rates cross the API as JSON strings on the goal DTOs (PF-154). Opt-in per
/// property, so the rest of the API keeps its current number contract.</summary>
public static class MoneyJson
{
    public const JsonNumberHandling AsString = JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString;
}

public sealed record GoalDto
{
    public Guid Id { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string Tier { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? Notes { get; init; }
    public short Priority { get; init; }
    public string Recurrence { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public DateTime? AchievedAt { get; init; }
    public short ColorIndex { get; init; }

    [JsonNumberHandling(MoneyJson.AsString)] public decimal TargetAmount { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal EffectiveTarget { get; init; }
    /// <summary>Σ every cost item including the loan principal, or null when there is no breakdown.</summary>
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? TotalCost { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal Allocated { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal Remaining { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal Surplus { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal PercentComplete { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? MonthlyNeeded { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? PriceGrowthRate { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? PlannedMonthlyInstalment { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? PacePerMonth { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? PostPurchaseDti { get; init; }

    public DateOnly? TargetDate { get; init; }
    public int? MonthsLeft { get; init; }
    public string Timeline { get; init; } = string.Empty;
    /// <summary>"yyyy-MM" or null.</summary>
    public string? PaceReachMonth { get; init; }
    public bool PaceBeyondCap { get; init; }
    /// <summary>"clear" | "not_recommended_yet" | "not_evaluated", or null for kinds without a gate.</summary>
    public string? GateState { get; init; }
    public IReadOnlyList<string> GateFailing { get; init; } = [];
    public IReadOnlyList<string> GateMissing { get; init; } = [];
    public IReadOnlyList<GoalCostItemDto> CostItems { get; init; } = [];
}

public sealed class GoalPageDto : PagedResult<GoalDto>
{
    public FoundationCheckDto Foundation { get; set; } = new();
    /// <summary>The Monthly plan card. Set only for status=open, computed over every open goal, not only this page.</summary>
    public GoalPlanSummaryDto? Summary { get; set; }
}

public sealed record GoalPlanSummaryDto
{
    [JsonNumberHandling(MoneyJson.AsString)] public decimal MonthlyTotal { get; init; }
    public int ScheduledCount { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal OverdueRemaining { get; init; }
    public IReadOnlyList<string> OverdueGoalNames { get; init; } = [];
    public IReadOnlyList<GoalPlanSegmentDto> Segments { get; init; } = [];
}

public sealed record GoalPlanSegmentDto
{
    public Guid GoalId { get; init; }
    public string Name { get; init; } = string.Empty;
    public short ColorIndex { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal Allocated { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal EffectiveTarget { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal PercentComplete { get; init; }
    /// <summary>EffectiveTarget / Σ EffectiveTarget × 100, to 0.01. A width ratio, so the browser never parses money.</summary>
    [JsonNumberHandling(MoneyJson.AsString)] public decimal BarShare { get; init; }
}

public sealed record FoundationCheckDto
{
    public string State { get; init; } = "not_evaluated";
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? SpendRatio { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? CoverMonthsAfterEarmarks { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal EarmarkedInSavings { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? CurrentDti { get; init; }
    public IReadOnlyList<string> Failing { get; init; } = [];
    public IReadOnlyList<string> Missing { get; init; } = [];
}

public sealed record GoalPreviewDto
{
    /// <summary>Σ cost items except the loan principal, when a breakdown was sent.</summary>
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? CashNeeded { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? TotalCost { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal EffectiveTarget { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal Allocated { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal AllocatedAfter { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal PercentAfter { get; init; }
    // Remaining, Surplus, MonthlyNeeded, MonthsLeft and Timeline describe the goal after the draft contribution.
    [JsonNumberHandling(MoneyJson.AsString)] public decimal Remaining { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal Surplus { get; init; }
    [JsonNumberHandling(MoneyJson.AsString)] public decimal? MonthlyNeeded { get; init; }
    public int? MonthsLeft { get; init; }
    public string Timeline { get; init; } = string.Empty;
    /// <summary>True when a draft withdrawal exceeds Allocated. The 400 on save is still the real guard.</summary>
    public bool Overdrawn { get; init; }
}

public sealed record GoalContributionDto(
    Guid Id,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal Amount,
    DateOnly ContributedOn,
    Guid? HeldInAccountId,
    string? Note);

public sealed record GoalCostItemDto(
    Guid Id,
    string ItemType,
    string Label,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal Amount,
    short SortOrder);

/// <summary>A cost line sent by the client, in the goal form and in previews.</summary>
public sealed record GoalCostItemInput(
    string ItemType,
    string Label,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal Amount);
