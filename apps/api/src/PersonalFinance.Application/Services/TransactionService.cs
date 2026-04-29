using MediatR;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;
using Microsoft.Extensions.Logging;

public class TransactionService : ITransactionService
{
    private readonly Supabase.Client _supabase;
    private readonly IMediator _mediator;
    private readonly ILogger<TransactionService> _logger;

    public TransactionService(Supabase.Client supabase, IMediator mediator, ILogger<TransactionService> logger)
    {
        _supabase = supabase;
        _mediator = mediator;
        _logger = logger;
    }

    public async Task<List<TransactionDto>> AddTransactionsAsync(IEnumerable<TransactionDto> transactionDtos)
    {
        var entities = transactionDtos.Select(MapToEntity).ToList();
        _logger.LogInformation("Adding {Count} transactions.", entities.Count);

        // Bulk insert — one DB round-trip (N+1 fix for PF-039)
        var result = await _supabase.From<Transaction>().Insert(entities);

        _logger.LogInformation("Supabase confirmed {ConfirmedCount} of {RequestedCount} transactions inserted.", result.Models.Count, entities.Count);
        return result.Models.Select(MapToDto).ToList();
    }

    public async Task<List<TransactionDto>> FilterOutDuplicatesAsync(IEnumerable<TransactionDto> transactionDtos)
    {
        var dtoList = transactionDtos.ToList();
        _logger.LogDebug("Filtering out duplicates from {Count} transactions.", dtoList.Count);
        var wallets = dtoList.Select(t => t.Wallet).Distinct().ToList();

        var result = await _supabase.From<Transaction>()
            .Filter("wallet", Operator.In, wallets)
            .Get();

        var existingKeySet = new HashSet<string>(
            result.Models.Select(t => $"{t.Date:u}|{t.Description}|{t.Flow}|{t.Type}|{t.Wallet}")
        );

        var filtered = dtoList
            .Where(t => !existingKeySet.Contains($"{t.Date:u}|{t.Description}|{t.Flow}|{t.Type}|{t.Wallet}"))
            .ToList();
            
        _logger.LogInformation("Filtered out {DuplicateCount} duplicates. Returning {FilteredCount} transactions.", dtoList.Count - filtered.Count, filtered.Count);
        return filtered;
    }

    public async Task<List<TransactionDto>> GetTransactionsWithBalanceAsync(string? wallet)
    {
        var query = _supabase.From<Transaction>()
            .Order("date", Ordering.Ascending)
            .Order("id", Ordering.Ascending);

        if (!string.IsNullOrEmpty(wallet))
            query = query.Filter("wallet", Operator.Equals, wallet);

        var result = await query.Get();

        var runningBalance = 0m;
        return result.Models.Select(t =>
        {
            runningBalance += t.Flow == "CR" ? t.AmountIdr : -t.AmountIdr;
            var dto = MapToDto(t);
            dto.Balance = runningBalance;
            return dto;
        }).ToList();
    }

    public async Task<TransactionDto?> GetTransactionByIdAsync(int id)
    {
        var entity = await _supabase.From<Transaction>()
            .Filter("id", Operator.Equals, id.ToString())
            .Single();
        return entity == null ? null : MapToDto(entity);
    }

    private static Transaction MapToEntity(TransactionDto dto) => new()
    {
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

    private static TransactionDto MapToDto(Transaction t) => new()
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
        ExchangeRate = t.ExchangeRate
    };
}
