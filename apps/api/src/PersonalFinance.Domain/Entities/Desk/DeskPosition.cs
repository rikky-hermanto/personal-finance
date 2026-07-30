using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities.Desk;

[Table("desk_positions")]
public class DeskPosition : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("broker")]
    public string Broker { get; set; } = string.Empty;

    [Column("account_external_key")]
    public string? AccountExternalKey { get; set; }

    [Column("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [Column("asset_class")]
    public string AssetClass { get; set; } = string.Empty;

    [Column("qty")]
    public decimal? Qty { get; set; }

    [Column("qty_shares")]
    public decimal? QtyShares { get; set; }

    [Column("qty_lots")]
    public decimal? QtyLots { get; set; }

    [Column("avg_price")]
    public decimal? AvgPrice { get; set; }

    [Column("avg_price_native")]
    public decimal? AvgPriceNative { get; set; }

    [Column("last_price")]
    public decimal? LastPrice { get; set; }

    [Column("last_price_native")]
    public decimal? LastPriceNative { get; set; }

    [Column("cost_idr")]
    public decimal CostIdr { get; set; }

    [Column("mv_idr")]
    public decimal MvIdr { get; set; }

    [Column("pnl_idr")]
    public decimal PnlIdr { get; set; }

    [Column("pnl_pct")]
    public decimal PnlPct { get; set; }

    [Column("weight")]
    public decimal Weight { get; set; }

    [Column("sleeve")]
    public string Sleeve { get; set; } = "Legacy / Unclassified";

    [Column("stop_price")]
    public decimal? StopPrice { get; set; }

    [Column("unconfirmed")]
    public bool Unconfirmed { get; set; }

    [Column("estimated_cost_basis")]
    public bool EstimatedCostBasis { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
