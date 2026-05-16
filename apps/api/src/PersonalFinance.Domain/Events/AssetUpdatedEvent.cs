using MediatR;

public class AssetUpdatedEvent : INotification
{
    public Guid UserId { get; }

    public AssetUpdatedEvent(Guid userId)
    {
        UserId = userId;
    }
}
