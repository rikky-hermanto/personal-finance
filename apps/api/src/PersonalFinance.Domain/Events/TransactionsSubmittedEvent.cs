using MediatR;

/// <summary>Published once per successful import batch, after the rows are committed.</summary>
public sealed record TransactionsSubmittedEvent(Guid UserId, int InsertedCount) : INotification;
