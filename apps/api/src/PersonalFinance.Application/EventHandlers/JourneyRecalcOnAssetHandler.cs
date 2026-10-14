using MediatR;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Application.EventHandlers;

public class JourneyRecalcOnAssetHandler(
    IMediator mediator,
    ILogger<JourneyRecalcOnAssetHandler> logger)
    : INotificationHandler<AssetUpdatedEvent>
{
    public async Task Handle(AssetUpdatedEvent notification, CancellationToken ct)
    {
        // Recalculate only for the asset's verified owner; never a placeholder.
        if (notification.UserId == Guid.Empty)
        {
            logger.LogWarning("Journey recalc skipped: asset event has no owner");
            return;
        }

        try
        {
            await mediator.Send(new RecalculateJourneyCommand(notification.UserId), ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Journey recalc failed after asset updated");
        }
    }
}
