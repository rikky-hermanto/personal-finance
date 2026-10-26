using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

/// <summary>Snoozed quests on user_journey_state ({"l1.sort_the_pile": "2026-11-25"}). One column only.</summary>
[Table("user_journey_state")]
public class UserJourneySnoozes : BaseModel
{
    [PrimaryKey("user_id", shouldInsert: true)]
    public Guid UserId { get; set; }

    [Column("quest_snoozes")]
    public Dictionary<string, string> QuestSnoozes { get; set; } = new();
}
