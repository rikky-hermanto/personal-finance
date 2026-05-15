using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("liabilities")]
public class Liability : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("liability_type")]
    public string LiabilityType { get; set; } = string.Empty;

    [Column("account_id")]
    public Guid? AccountId { get; set; }

    [Column("asset_id")]
    public Guid? AssetId { get; set; }

    [Column("principal")]
    public decimal Principal { get; set; }

    [Column("interest_rate")]
    public decimal? InterestRate { get; set; }

    [Column("start_date")]
    public DateTime StartDate { get; set; }

    [Column("end_date")]
    public DateTime? EndDate { get; set; }

    [Column("monthly_payment")]
    public decimal? MonthlyPayment { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
