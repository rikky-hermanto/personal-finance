using Newtonsoft.Json;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities.Desk;

[Table("desk_journal_entries")]
public class DeskJournalEntry : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("trade_date")]
    public DateTime TradeDate { get; set; }

    [Column("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [Column("broker")]
    public string Broker { get; set; } = string.Empty;

    [Column("strategy")]
    public string? Strategy { get; set; }

    [Column("planned_qty")]
    public decimal? PlannedQty { get; set; }

    [Column("actual_qty")]
    public decimal? ActualQty { get; set; }

    [Column("entry_price")]
    public decimal? EntryPrice { get; set; }

    [Column("exit_price")]
    public decimal? ExitPrice { get; set; }

    [Column("net_pnl")]
    public decimal NetPnl { get; set; }

    [Column("realized_r")]
    public decimal? RealizedR { get; set; }

    [Column("compliant")]
    public bool Compliant { get; set; } = true;

    // Raw JSON — deserialized in the service layer, never in Domain. RawJsonConverter handles the
    // jsonb array <-> string round-trip (PostgREST returns jsonb as native JSON, not a quoted string).
    [Column("tags")]
    [JsonConverter(typeof(RawJsonConverter))]
    public string Tags { get; set; } = "[]";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
