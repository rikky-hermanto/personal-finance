using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Interfaces;

public interface ITransactionService
{
    Task<List<Transaction>> ImportFromCsvAsync(Stream stream);
}
