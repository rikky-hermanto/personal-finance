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

    public async Task<List<Transaction>> AddTransactionsAsync(IEnumerable<Transaction> transactions)
    {
        try
        {
            var newTransactions = await FilterOutDuplicatesAsync(transactions);

            if (newTransactions.Count > 0)
            {
                await _dbContext.Transactions.AddRangeAsync(newTransactions);
                await _dbContext.SaveChangesAsync();
            }

            return newTransactions;
        }
        catch (DbUpdateException ex)
        {
            // Log or handle the exception as needed
            throw new InvalidOperationException("An error occurred while saving the entity changes. See the inner exception for details.", ex);
        }
    }

    /// <summary>
    /// Returns only transactions that do not already exist in the database
    /// (by Date, Description, Flow, Type, Wallet).
    /// </summary>
    private async Task<List<Transaction>> FilterOutDuplicatesAsync(IEnumerable<Transaction> transactions)
    {
        // Prepare keys for lookup
        var keys = transactions
            .Select(t => new
            {
                t.Date,
                t.Description,
                t.Flow,
                t.Type,
                t.Wallet
            })
            .ToList();

        // Get distinct values for each property to filter the superset
        var dates = keys.Select(k => k.Date).Distinct().ToList();
        var descriptions = keys.Select(k => k.Description).Distinct().ToList();
        var flows = keys.Select(k => k.Flow).Distinct().ToList();
        var types = keys.Select(k => k.Type).Distinct().ToList();
        var wallets = keys.Select(k => k.Wallet).Distinct().ToList();

        // Query possible existing transactions with any matching property values
        var possibleMatches = await _dbContext.Transactions
            .Where(t =>
                dates.Contains(t.Date) &&
                descriptions.Contains(t.Description) &&
                flows.Contains(t.Flow) &&
                types.Contains(t.Type) &&
                wallets.Contains(t.Wallet))
            .Select(t => new
            {
                t.Date,
                t.Description,
                t.Flow,
                t.Type,
                t.Wallet
            })
            .ToListAsync();

        // Build a set of string keys for existing transactions
        var existingKeySet = new HashSet<string>(
            possibleMatches.Select(k => $"{k.Date:u}|{k.Description}|{k.Flow}|{k.Type}|{k.Wallet}")
        );

        // Filter out duplicates
        return transactions
            .Where(t => !existingKeySet.Contains($"{t.Date:u}|{t.Description}|{t.Flow}|{t.Type}|{t.Wallet}"))
            .ToList();
    }
}