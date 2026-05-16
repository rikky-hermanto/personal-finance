using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("journey_achievements")]
public class JourneyAchievement : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public long Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("achievement_code")]
    public string AchievementCode { get; set; } = string.Empty;

    [Column("unlocked_at")]
    public DateTime UnlockedAt { get; set; }
}
