using Newtonsoft.Json;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities.Desk;

[Table("desk_mandate_versions")]
public class DeskMandateVersion : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("version")]
    public int Version { get; set; }

    [Column("status")]
    public string Status { get; set; } = "draft";

    [Column("preset")]
    public string? Preset { get; set; }

    // Raw JSON — deserialized in the service layer, never in Domain. RawJsonConverter handles the
    // jsonb object <-> string round-trip (PostgREST returns jsonb as native JSON, not a quoted string).
    [Column("params")]
    [JsonConverter(typeof(RawJsonConverter))]
    public string Params { get; set; } = "{}";

    [Column("effective_date")]
    public DateTime? EffectiveDate { get; set; }

    [Column("change_reason")]
    public string? ChangeReason { get; set; }

    [Column("approved_at")]
    public DateTime? ApprovedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
