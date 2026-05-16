using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("investment_holdings")]
public class InvestmentHolding : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("setup_id")]
    public Guid SetupId { get; set; }

    [Column("ticker")]
    public string? Ticker { get; set; }

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("asset_class")]
    public string AssetClass { get; set; } = string.Empty;

    [Column("sector")]
    public string? Sector { get; set; }

    [Column("allocation_pct")]
    public decimal? AllocationPct { get; set; }

    [Column("quantity")]
    public decimal? Quantity { get; set; }

    [Column("avg_buy_price")]
    public decimal? AvgBuyPrice { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
