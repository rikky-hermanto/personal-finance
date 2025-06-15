using Microsoft.EntityFrameworkCore;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Persistence;

public class TransactionService : ITransactionService
{
    private readonly AppDbContext _dbContext;
        
    public TransactionService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task AddTransactionsAsync(IEnumerable<Transaction> transactions)
    {
        try
        {
            await _dbContext.Transactions.AddRangeAsync(transactions);
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
        {
            // Log or handle the exception as needed
            throw new InvalidOperationException("An error occurred while saving the entity changes. See the inner exception for details.", ex);
        }
    }
}