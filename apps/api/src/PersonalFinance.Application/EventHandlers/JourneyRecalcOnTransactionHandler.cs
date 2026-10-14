using MediatR;
using PersonalFinance.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Application.EventHandlers;

public class JourneyRecalcOnTransactionHandler(
    IMediator mediator,
    ICashflowPilotMode pilotMode,
    ILogger<JourneyRecalcOnTransactionHandler> logger)
    : INotificationHandler<TransactionCreatedEvent>
{
    // Placeholder until Journey is owner-scoped; the pilot check below keeps it off real users.
    private static readonly Guid PlaceholderUserId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    public async Task Handle(TransactionCreatedEvent notification, CancellationToken ct)
    {
        // Journey scoring is not owner-scoped yet; never recalc placeholder data while
        // the pilot serves real users.
        if (pilotMode.Enabled)
        {
            logger.LogDebug("Journey recalc skipped during Cashflow pilot");
            return;
        }

        try
        {
            await mediator.Send(new RecalculateJourneyCommand(PlaceholderUserId), ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Journey recalc failed after transaction created");
        }
    }
}
