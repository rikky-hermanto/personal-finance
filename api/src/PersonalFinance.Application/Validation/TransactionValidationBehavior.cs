using MediatR;
using PersonalFinance.Domain.Entities;

public class TransactionValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        if (request is TransactionCreatedEvent evt)
        {
            var t = evt.Transaction;

            if (t.Date == default)
                throw new ArgumentException("Transaction date is required.");

            if (string.IsNullOrWhiteSpace(t.Description))
                throw new ArgumentException("Transaction description is required.");

            if (string.IsNullOrWhiteSpace(t.Flow) || (t.Flow != "DB" && t.Flow != "CR"))
                throw new ArgumentException("Transaction flow must be 'DB' or 'CR'.");

            if (string.IsNullOrWhiteSpace(t.Type) || (t.Type != "Expense" && t.Type != "Income"))
                throw new ArgumentException("Transaction type must be 'Expense' or 'Income'.");

            if (string.IsNullOrWhiteSpace(t.Wallet))
                throw new ArgumentException("Transaction wallet is required.");

            if (t.AmountIdr < 0)
                throw new ArgumentException("Transaction amount must be non-negative.");

            if (string.IsNullOrWhiteSpace(t.Currency))
                throw new ArgumentException("Transaction currency is required.");
        }

        return await next();
    }
}