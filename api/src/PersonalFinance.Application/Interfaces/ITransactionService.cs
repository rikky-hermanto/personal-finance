using PersonalFinance.Application.Dtos;

public interface ITransactionService
{
    /// <summary>
    /// Adds only new (non-duplicate) transactions and returns the added transactions as DTOs.
    /// </summary>
    Task<List<TransactionDto>> AddTransactionsAsync(IEnumerable<TransactionDto> transactionDtos);

    /// <summary>
    /// Returns transactions with running balance for a wallet.
    /// </summary>
    Task<List<TransactionDto>> GetTransactionsWithBalanceAsync(string wallet);

    /// <summary>
    /// Returns only transactions that do not already exist in the database
    /// (by Date, Description, Flow, Type, Wallet) as DTOs.
    /// </summary>
    Task<List<TransactionDto>> FilterOutDuplicatesAsync(IEnumerable<TransactionDto> transactionDtos);
}