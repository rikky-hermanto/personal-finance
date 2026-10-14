using MediatR;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Application.EventHandlers;

public class JourneyRecalcOnTransactionHandler(
    IMediator mediator,
    ILogger<JourneyRecalcOnTransactionHandler> logger)
    : INotificationHandler<TransactionCreatedEvent>
{
    public async Task Handle(TransactionCreatedEvent notification, CancellationToken ct)
    {
        // Recalculate only for the transaction's verified owner; never a placeholder.
        if (notification.Transaction.UserId is not { } owner || owner == Guid.Empty)
        {
            logger.LogWarning("Journey recalc skipped: transaction {Id} has no owner", notification.Transaction.Id);
            return;
        }

        try
        {
            await mediator.Send(new RecalculateJourneyCommand(owner), ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Journey recalc failed after transaction created");
        }
    }
}
