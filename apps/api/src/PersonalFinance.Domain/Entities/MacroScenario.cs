using Newtonsoft.Json;
using PersonalFinance.Domain.Entities.Desk;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("macro_scenarios")]
public class MacroScenario : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    // Raw JSON — a serialized MacroDrivers object. Deserialized in the frontend, never in Domain.
    // RawJsonConverter handles the jsonb <-> string round-trip (PostgREST returns jsonb as native
    // JSON, not a quoted string) — see Domain/Entities/Desk/RawJsonConverter.cs for why this is needed.
    [Column("drivers_json")]
    [JsonConverter(typeof(RawJsonConverter))]
    public string DriversJson { get; set; } = "{}";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
