using MediatR;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Application.EventHandlers;

public class JourneyRecalcOnTransactionHandler(
    IMediator mediator,
    ILogger<JourneyRecalcOnTransactionHandler> logger)
    : INotificationHandler<TransactionCreatedEvent>
{
    // Pre-auth placeholder — replaced by User.FindFirst("sub") in PF-S08
    private static readonly Guid PlaceholderUserId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    public async Task Handle(TransactionCreatedEvent notification, CancellationToken ct)
    {
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
