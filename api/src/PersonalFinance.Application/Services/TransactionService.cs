using MediatR;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Persistence;
using PersonalFinance.Application.Dtos;

public class TransactionService : ITransactionService
{
    private readonly AppDbContext _dbContext;
    private readonly IMediator _mediator;

    public TransactionService(AppDbContext dbContext, IMediator mediator)
    {
        _dbContext = dbContext;
        _mediator = mediator;
    }

    public async Task<List<Transaction>> AddTransactionsAsync(IEnumerable<Transaction> transactions)
    {
        try
        {
            var newTransactions = await FilterOutDuplicatesAsync(transactions);

            List<Transaction> addedTransactions = new List<Transaction>();
            foreach (var t in newTransactions)
            {
                var added = await _mediator.Send(new CreateTransactionCommand(t));
                addedTransactions.Add(added);
            }

            return addedTransactions;
        }
        catch (DbUpdateException ex)
        {
            throw new InvalidOperationException("An error occurred while saving the entity changes. See the inner exception for details.", ex);
        }
    }

    /// <summary>
    /// Returns only transactions that do not already exist in the database
    /// (by Date, Description, Flow, Type, Wallet).
    /// </summary>
    private async Task<List<Transaction>> FilterOutDuplicatesAsync(IEnumerable<Transaction> transactions)
    {
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

        var dates = keys.Select(k => k.Date).Distinct().ToList();
        var descriptions = keys.Select(k => k.Description).Distinct().ToList();
        var flows = keys.Select(k => k.Flow).Distinct().ToList();
        var types = keys.Select(k => k.Type).Distinct().ToList();
        var wallets = keys.Select(k => k.Wallet).Distinct().ToList();

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

        var existingKeySet = new HashSet<string>(
            possibleMatches.Select(k => $"{k.Date:u}|{k.Description}|{k.Flow}|{k.Type}|{k.Wallet}")
        );

        return transactions
            .Where(t => !existingKeySet.Contains($"{t.Date:u}|{t.Description}|{t.Flow}|{t.Type}|{t.Wallet}"))
            .ToList();
    }

    // New: Get transactions with running balance (on the fly)
    public async Task<List<TransactionDto>> GetTransactionsWithBalanceAsync(string wallet)
    {
        var transactions = await _dbContext.Transactions
            .Where(t => t.Wallet == wallet)
            .OrderBy(t => t.Date)
            .ThenBy(t => t.Id)
            .ToListAsync();

        var result = new List<TransactionDto>();
        decimal runningBalance = 0;

        foreach (var t in transactions)
        {
            runningBalance += t.Flow == "CR" ? t.AmountIdr : -t.AmountIdr;
            result.Add(new TransactionDto
            {
                Id = t.Id,
                Date = t.Date,
                Description = t.Description,
                Remarks = t.Remarks,
                Flow = t.Flow,
                Type = t.Type,
                Category = t.Category,
                Wallet = t.Wallet,
                AmountIdr = t.AmountIdr,
                Currency = t.Currency,
                ExchangeRate = t.ExchangeRate,
                Balance = runningBalance
            });
        }

        return result;
    }
}