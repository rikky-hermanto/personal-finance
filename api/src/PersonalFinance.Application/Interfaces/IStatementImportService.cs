using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;

public interface IStatementImportService
{
    Task<List<TransactionDto>> ImportAsync(Stream stream, string bankCode, string? password = null);
}