using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

/// <summary>A shared, tier-tagged goal (PF-154). Allocated is never stored: it is the sum of goal_contributions.</summary>
[Table("goals")]
public class Goal : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("kind")]
    public string Kind { get; set; } = string.Empty;

    [Column("tier")]
    public string Tier { get; set; } = string.Empty;

    [Column("category")]
    public string Category { get; set; } = "other";

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("priority")]
    public short Priority { get; set; } = 2;

    [Column("recurrence")]
    public string Recurrence { get; set; } = "one_off";

    [Column("target_amount")]
    public decimal TargetAmount { get; set; }

    [Column("currency")]
    public string Currency { get; set; } = "IDR";

    [Column("target_date")]
    public DateTime? TargetDate { get; set; }

    [Column("price_growth_rate")]
    public decimal? PriceGrowthRate { get; set; }

    [Column("planned_monthly_instalment")]
    public decimal? PlannedMonthlyInstalment { get; set; }

    [Column("status")]
    public string Status { get; set; } = "active";

    [Column("achieved_at")]
    public DateTime? AchievedAt { get; set; }

    [Column("color_index")]
    public short ColorIndex { get; set; }

    [Column("created_at", ignoreOnInsert: true, ignoreOnUpdate: true)]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
