using PersonalFinance.Domain.Entities;
using PersonalFinance.Application.Dtos;

public interface ITransactionService
{
    /// <summary>
    /// Adds only new (non-duplicate) transactions and returns the added transactions.
    /// </summary>
    Task<List<Transaction>> AddTransactionsAsync(IEnumerable<Transaction> transactions);

    /// <summary>
    /// Returns transactions with running balance for a wallet.
    /// </summary>
    Task<List<TransactionDto>> GetTransactionsWithBalanceAsync(string wallet);
}