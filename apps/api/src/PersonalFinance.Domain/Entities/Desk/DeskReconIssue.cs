using Newtonsoft.Json;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities.Desk;

[Table("desk_recon_issues")]
public class DeskReconIssue : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("external_key")]
    public string ExternalKey { get; set; } = string.Empty;

    [Column("label")]
    public string Label { get; set; } = string.Empty;

    [Column("account")]
    public string Account { get; set; } = string.Empty;

    [Column("amount")]
    public decimal? Amount { get; set; }

    [Column("currency")]
    public string? Currency { get; set; }

    [Column("resolution")]
    public string Resolution { get; set; } = "unresolved";

    // Raw JSON — deserialized in the service layer, never in Domain. RawJsonConverter handles the
    // jsonb array <-> string round-trip (PostgREST returns jsonb as native JSON, not a quoted string).
    [Column("options")]
    [JsonConverter(typeof(RawJsonConverter))]
    public string Options { get; set; } = "[]";

    [Column("resolved_at")]
    public DateTime? ResolvedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
