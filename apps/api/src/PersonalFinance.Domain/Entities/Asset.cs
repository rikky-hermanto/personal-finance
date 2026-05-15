using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("assets")]
public class Asset : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("asset_class")]
    public string AssetClass { get; set; } = string.Empty;

    [Column("account_id")]
    public Guid? AccountId { get; set; }

    [Column("acquired_date")]
    public DateTime? AcquiredDate { get; set; }

    [Column("acquisition_cost")]
    public decimal? AcquisitionCost { get; set; }

    [Column("currency")]
    public string Currency { get; set; } = "IDR";

    [Column("valuation_strategy")]
    public string ValuationStrategy { get; set; } = "Manual";

    [Column("metadata")]
    public string? Metadata { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
