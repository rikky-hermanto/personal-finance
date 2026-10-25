using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

/// <summary>
/// Narrow view of user_journey_state holding only the user-entered "I have no debts" confirmation.
/// JourneyScoringService upserts the full UserJourneyState row on every recalculation; keeping this
/// column off that entity means a recalculation can never overwrite the confirmation, and writing
/// the confirmation (a partial upsert) never touches the scores.
/// </summary>
[Table("user_journey_state")]
public class JourneyDebtConfirmation : BaseModel
{
    [PrimaryKey("user_id", shouldInsert: true)]
    public Guid UserId { get; set; }

    [Column("no_debts_confirmed_at")]
    public DateTime? NoDebtsConfirmedAt { get; set; }
}
