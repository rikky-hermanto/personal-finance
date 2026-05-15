using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("holdings")]
public class Holding : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("account_id")]
    public Guid AccountId { get; set; }

    [Column("ticker")]
    public string Ticker { get; set; } = string.Empty;

    [Column("quantity")]
    public decimal Quantity { get; set; }

    [Column("cost_basis")]
    public decimal CostBasis { get; set; }

    [Column("currency")]
    public string Currency { get; set; } = "IDR";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
