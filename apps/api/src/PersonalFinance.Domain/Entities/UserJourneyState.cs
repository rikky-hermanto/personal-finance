using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("user_journey_state")]
public class UserJourneyState : BaseModel
{
    [PrimaryKey("user_id", shouldInsert: true)]
    public Guid UserId { get; set; }

    [Column("current_level")]
    public short CurrentLevel { get; set; } = 1;

    [Column("total_score")]
    public decimal TotalScore { get; set; }

    [Column("level_scores")]
    public string LevelScoresJson { get; set; } = "{}";

    [Column("indicator_scores")]
    public string IndicatorScoresJson { get; set; } = "{}";

    // Raw value per LIVE indicator (months of cover, spend ratio...). A real jsonb object.
    [Column("indicator_raw")]
    public Dictionary<string, decimal> IndicatorRaw { get; set; } = new();

    [Column("last_computed_at")]
    public DateTime LastComputedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
