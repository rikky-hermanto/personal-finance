using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Infrastructure.Parsers;
using PersonalFinance.Persistence;

namespace PersonalFinance.Application.Services;

public class TransactionService : ITransactionService
{
    private readonly AppDbContext _db;
    private readonly CsvTransactionParser _parser;

    public TransactionService(AppDbContext db, CsvTransactionParser parser)
    {
        _db = db;
        _parser = parser;
    }

    public async Task<List<Transaction>> ImportFromCsvAsync(Stream stream)
    {
        var transactions = await _parser.ParseAsync(stream);
        _db.Transactions.AddRange(transactions);
        await _db.SaveChangesAsync();
        return transactions;
    }
}
