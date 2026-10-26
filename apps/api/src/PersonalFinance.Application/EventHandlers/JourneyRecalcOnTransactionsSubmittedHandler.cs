using MediatR;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Application.EventHandlers;

public class JourneyRecalcOnTransactionsSubmittedHandler(
    IMediator mediator,
    ILogger<JourneyRecalcOnTransactionsSubmittedHandler> logger)
    : INotificationHandler<TransactionsSubmittedEvent>
{
    public async Task Handle(TransactionsSubmittedEvent notification, CancellationToken ct)
    {
        // Recalculate only for the batch's verified owner; never a placeholder.
        if (notification.UserId == Guid.Empty)
        {
            logger.LogWarning("Journey recalc skipped: transactions submitted event has no owner");
            return;
        }

        try
        {
            await mediator.Send(new RecalculateJourneyCommand(notification.UserId), ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Journey recalc failed after transactions submitted");
        }
    }
}
