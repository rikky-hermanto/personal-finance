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

    public async Task<List<TransactionDto>> AddTransactionsAsync(IEnumerable<TransactionDto> transactionDtos)
    {
        try
        {
            List<TransactionDto> addedDtos = new List<TransactionDto>();
            foreach (var dto in transactionDtos)
            {
                var entity = MapToEntity(dto);
                var added = await _mediator.Send(new CreateTransactionCommand(entity));
                addedDtos.Add(MapToDto(added));
            }

            return addedDtos;
        }
        catch (DbUpdateException ex)
        {
            throw new InvalidOperationException("An error occurred while saving the entity changes. See the inner exception for details.", ex);
        }
    }

    public async Task<List<TransactionDto>> FilterOutDuplicatesAsync(IEnumerable<TransactionDto> transactionDtos)
    {
        var keys = transactionDtos
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

        return transactionDtos
              .Where(t => !existingKeySet.Contains($"{t.Date:u}|{t.Description}|{t.Flow}|{t.Type}|{t.Wallet}"))
              .ToList();
    }

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
            var dto = MapToDto(t);
            dto.Balance = runningBalance;
            result.Add(dto);
        }

        return result;
    }

    private static Transaction MapToEntity(TransactionDto dto)
    {
        return new Transaction
        {
            Id = dto.Id,
            Date = dto.Date,
            Description = dto.Description,
            Remarks = dto.Remarks,
            Flow = dto.Flow,
            Type = dto.Type,
            Category = dto.Category,
            Wallet = dto.Wallet,
            AmountIdr = dto.AmountIdr,
            Currency = dto.Currency,
            ExchangeRate = dto.ExchangeRate
        };
    }

    private static TransactionDto MapToDto(Transaction entity)
    {
        return new TransactionDto
        {
            Id = entity.Id,
            Date = entity.Date,
            Description = entity.Description,
            Remarks = entity.Remarks,
            Flow = entity.Flow,
            Type = entity.Type,
            Category = entity.Category,
            Wallet = entity.Wallet,
            AmountIdr = entity.AmountIdr,
            Currency = entity.Currency,
            ExchangeRate = entity.ExchangeRate,
            // Balance is set in GetTransactionsWithBalanceAsync
        };
    }
}