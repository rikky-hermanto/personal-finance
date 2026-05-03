using PersonalFinance.Application.Dtos;

public interface ITransactionService
{
    /// <summary>
    /// Adds only new (non-duplicate) transactions and returns the added transactions as DTOs.
    /// </summary>
    Task<List<TransactionDto>> AddTransactionsAsync(IEnumerable<TransactionDto> transactionDtos);

    /// <summary>
    /// Returns transactions with running balance for a wallet and optional filters.
    /// </summary>
    Task<List<TransactionDto>> GetTransactionsWithBalanceAsync(
        string? wallet = null,
        string? search = null,
        string? category = null,
        string? type = null);

    /// <summary>
    /// Returns only transactions that do not already exist in the database
    /// (by Date, Description, Flow, Type, Wallet) as DTOs.
    /// </summary>
    Task<List<TransactionDto>> FilterOutDuplicatesAsync(IEnumerable<TransactionDto> transactionDtos);

    /// <summary>
    /// Retrieves a transaction by its unique identifier.
    /// </summary>
    Task<TransactionDto?> GetTransactionByIdAsync(int id);

    /// <summary>
    /// Returns a paginated page of transactions (newest first) with optional filters.
    /// </summary>
    Task<PagedResult<TransactionDto>> GetTransactionPageAsync(
        int page,
        int pageSize,
        string? wallet = null,
        string? search = null,
        string? category = null,
        string? type = null,
        string sortOrder = "desc");
}