using MediatR;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Behaviors;

public sealed class PublishAssetUpdatedBehavior<TRequest, TResponse>(IPublisher publisher, ICurrentUser caller)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull, IAffectsJourney
{
    public async Task<TResponse> Handle(
        TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        var response = await next();
        // The write is committed. CancellationToken.None so a closed tab cannot leave scores stale.
        await publisher.Publish(new AssetUpdatedEvent(caller.UserId), CancellationToken.None);
        return response;
    }
}
