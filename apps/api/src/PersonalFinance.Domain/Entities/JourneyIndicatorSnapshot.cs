using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("journey_indicator_snapshots")]
public class JourneyIndicatorSnapshot : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public long Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("snapshot_date")]
    public DateOnly SnapshotDate { get; set; }

    [Column("indicator_code")]
    public string IndicatorCode { get; set; } = string.Empty;

    [Column("score")]
    public decimal Score { get; set; }

    [Column("raw_value")]
    public decimal? RawValue { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
