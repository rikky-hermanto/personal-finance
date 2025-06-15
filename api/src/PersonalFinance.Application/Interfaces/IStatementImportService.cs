using PersonalFinance.Domain.Entities;

public interface IStatementImportService
{
    Task<List<Transaction>> ImportAsync(Stream stream, string bankCode);
}