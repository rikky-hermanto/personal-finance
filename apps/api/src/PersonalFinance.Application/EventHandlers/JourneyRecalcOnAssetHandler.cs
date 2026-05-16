using MediatR;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Application.EventHandlers;

public class JourneyRecalcOnAssetHandler(
    IMediator mediator,
    ILogger<JourneyRecalcOnAssetHandler> logger)
    : INotificationHandler<AssetUpdatedEvent>
{
    private static readonly Guid PlaceholderUserId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    public async Task Handle(AssetUpdatedEvent notification, CancellationToken ct)
    {
        try
        {
            await mediator.Send(new RecalculateJourneyCommand(PlaceholderUserId), ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Journey recalc failed after asset updated");
        }
    }
}
