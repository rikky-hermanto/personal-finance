using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Services;

public class JourneyConfirmationService(
    Supabase.Client supabase,
    ILogger<JourneyConfirmationService> logger
) : IJourneyConfirmationService
{
    public async Task<DateTime?> GetNoDebtsConfirmedAtAsync(Guid userId, CancellationToken ct = default)
    {
        var rows = await supabase.From<JourneyDebtConfirmation>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get();

        // The client deserializes timestamptz as local time; return UTC so GET matches PUT.
        return rows.Models.FirstOrDefault()?.NoDebtsConfirmedAt?.ToUniversalTime();
    }

    public async Task SetNoDebtsConfirmedAtAsync(Guid userId, DateTime? confirmedAt, CancellationToken ct = default)
    {
        // Partial upsert: only user_id and the confirmation are sent, so scores are untouched and
        // a missing row is created with the table defaults. A null clears the column.
        await supabase.From<JourneyDebtConfirmation>()
            .Upsert(new JourneyDebtConfirmation { UserId = userId, NoDebtsConfirmedAt = confirmedAt });

        logger.LogInformation("No-debts confirmation {Action} for user {UserId}",
            confirmedAt.HasValue ? "set" : "cleared", userId);
    }
}
