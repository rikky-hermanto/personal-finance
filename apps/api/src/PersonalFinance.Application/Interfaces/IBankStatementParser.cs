using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IBankStatementParser
{
    /// <summary>
    /// Parses a bank statement stream and returns a list of transaction DTOs.
    /// </summary>
    Task<List<TransactionDto>> ParseAsync(Stream fileStream, string? password = null);
}
