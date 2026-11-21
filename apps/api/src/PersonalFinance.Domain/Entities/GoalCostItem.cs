using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

/// <summary>One line of a property or vehicle goal's cost breakdown (PF-154). Amounts only, never rates.</summary>
[Table("goal_cost_items")]
public class GoalCostItem : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("goal_id")]
    public Guid GoalId { get; set; }

    [Column("item_type")]
    public string ItemType { get; set; } = string.Empty;

    [Column("label")]
    public string Label { get; set; } = string.Empty;

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("sort_order")]
    public short SortOrder { get; set; }

    [Column("created_at", ignoreOnInsert: true)]
    public DateTime CreatedAt { get; set; }
}
