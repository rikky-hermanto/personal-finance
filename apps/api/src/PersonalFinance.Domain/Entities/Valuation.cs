using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("valuations")]
public class Valuation : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("subject_type")]
    public string SubjectType { get; set; } = string.Empty;

    [Column("subject_id")]
    public Guid SubjectId { get; set; }

    [Column("value_native")]
    public decimal ValueNative { get; set; }

    [Column("currency")]
    public string Currency { get; set; } = "IDR";

    [Column("fx_rate_to_idr")]
    public decimal FxRateToIdr { get; set; } = 1m;

    [Column("value_idr")]
    public decimal ValueIdr { get; set; }

    [Column("source")]
    public string Source { get; set; } = "manual";

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("valued_at")]
    public DateTime ValuedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
