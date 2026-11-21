using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

/// <summary>One manual ledger row for a goal (PF-154). Negative amounts are withdrawals.</summary>
[Table("goal_contributions")]
public class GoalContribution : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("goal_id")]
    public Guid GoalId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("contributed_on")]
    public DateTime ContributedOn { get; set; }

    [Column("held_in_account_id")]
    public Guid? HeldInAccountId { get; set; }

    [Column("note")]
    public string? Note { get; set; }

    [Column("created_at", ignoreOnInsert: true)]
    public DateTime CreatedAt { get; set; }
}
