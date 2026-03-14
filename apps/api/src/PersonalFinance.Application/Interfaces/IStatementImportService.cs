using PersonalFinance.Application.Dtos;

public interface IStatementImportService
{
    Task<List<TransactionDto>> ImportAsync(Stream stream, string bankCode, string? password = null);
}