using PersonalFinance.Domain.Entities;

public interface ITransactionService
{
    /// <summary>
    /// Adds only new (non-duplicate) transactions and returns the added transactions.
    /// </summary>
    Task<List<Transaction>> AddTransactionsAsync(IEnumerable<Transaction> transactions);
}