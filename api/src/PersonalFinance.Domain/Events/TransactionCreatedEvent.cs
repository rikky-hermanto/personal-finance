using MediatR;
using PersonalFinance.Domain.Entities;

public class TransactionCreatedEvent : INotification
{
    public Transaction Transaction { get; }

    public TransactionCreatedEvent(Transaction transaction)
    {
        Transaction = transaction;
    }
}