using Newtonsoft.Json;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

/// <summary>Focus quest on user_journey_state. Maps only this column, so writing the focus never
/// carries the snoozes or any score column, and neither the scoring upsert nor a snooze write carries it.</summary>
[Table("user_journey_state")]
public class UserJourneyFocus : BaseModel
{
    [PrimaryKey("user_id", shouldInsert: true)]
    public Guid UserId { get; set; }

    // Include nulls: clearing the focus must send null instead of leaving the old value.
    [Column("focus_quest_code", NullValueHandling.Include)]
    public string? FocusQuestCode { get; set; }
}
