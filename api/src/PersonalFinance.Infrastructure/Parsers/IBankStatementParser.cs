using PersonalFinance.Domain.Entities;

public interface IBankStatementParser
{
    /// <summary>
    /// Parses a bank statement stream and returns a list of transactions.
    /// </summary>
    Task<List<Transaction>> ParseAsync(Stream fileStream, string? password = null);
}