using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("quest_completions")]
public class QuestCompletion : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public long Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("quest_code")]
    public string QuestCode { get; set; } = string.Empty;

    [Column("rung")]
    public short Rung { get; set; }

    [Column("catalog_version")]
    public short CatalogVersion { get; set; }

    // A typed dictionary, not a JSON string: the existing *_json string columns are stored as
    // jsonb strings (double-encoded). This one must reach Postgres as a real jsonb object.
    [Column("evidence")]
    public Dictionary<string, object?> Evidence { get; set; } = new();

    [Column("completed_at", ignoreOnInsert: true)]
    public DateTime CompletedAt { get; set; }

    [Column("seen_at")]
    public DateTime? SeenAt { get; set; }
}
