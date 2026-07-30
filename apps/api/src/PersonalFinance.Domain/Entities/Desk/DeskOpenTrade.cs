using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities.Desk;

[Table("desk_open_trades")]
public class DeskOpenTrade : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [Column("broker")]
    public string Broker { get; set; } = string.Empty;

    [Column("initial_risk")]
    public decimal InitialRisk { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
