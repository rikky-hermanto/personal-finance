using PersonalFinance.Application.Dtos;

public interface ITransactionService
{
    /// <summary>Adds only new (non-duplicate) transactions and returns the added transactions as DTOs.</summary>
    Task<List<TransactionDto>> AddTransactionsAsync(IEnumerable<TransactionDto> transactionDtos);

    /// <summary>Returns transactions with running balance for an account and optional filters.</summary>
    Task<List<TransactionDto>> GetTransactionsWithBalanceAsync(
        Guid? accountId = null,
        string? search = null,
        string? category = null,
        string? type = null);

    /// <summary>Returns only transactions that do not already exist in the database.</summary>
    Task<List<TransactionDto>> FilterOutDuplicatesAsync(IEnumerable<TransactionDto> transactionDtos);

    /// <summary>Tags each transaction in the input as duplicate or not. Returns the same list with IsDuplicate set.</summary>
    Task<List<TransactionDto>> IdentifyDuplicatesAsync(IEnumerable<TransactionDto> transactionDtos);

    /// <summary>Retrieves a transaction by its unique identifier.</summary>
    Task<TransactionDto?> GetTransactionByIdAsync(int id);

    /// <summary>Returns a paginated page of transactions (newest first) with optional filters.</summary>
    Task<PagedResult<TransactionDto>> GetTransactionPageAsync(
        int page,
        int pageSize,
        Guid? accountId = null,
        string? search = null,
        string? category = null,
        string? type = null,
        string sortOrder = "desc");

    /// <summary>Checks if a file hash already exists in the database.</summary>
    Task<bool> IsFileProcessedAsync(string fileHash);

    /// <summary>Records a file hash in the database.</summary>
    Task RegisterFileHashAsync(string fileHash, string fileName);

    /// <summary>Resolves a wallet alias text to an account_id. Returns null if no alias found.</summary>
    Task<Guid?> ResolveAliasAsync(string walletText);

    /// <summary>Upserts a wallet alias mapping. Silently ignores if the pair already exists.</summary>
    Task UpsertAliasAsync(string walletText, Guid accountId);
}
