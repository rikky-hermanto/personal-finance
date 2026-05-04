using MediatR;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;
using Supabase.Postgrest;
using Supabase.Postgrest.Interfaces;
using Supabase.Postgrest.Responses;
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
        try
        {
            var result = await _supabase.From<Transaction>().Insert(entities);
            _logger.LogInformation("Supabase confirmed {ConfirmedCount} of {RequestedCount} transactions inserted.", result.Models.Count, entities.Count);
            return result.Models.Select(MapToDto).ToList();
        }
        catch (Exception ex) when (ex.Message.Contains("23505")) // Postgres Unique Violation code
        {
            _logger.LogWarning("Unique constraint violation during bulk insert. Some transactions might be duplicates.");
            // Fallback: Fetch what was actually inserted or just return what we have (best effort)
            return new List<TransactionDto>(); 
        }
    }

    public async Task<List<TransactionDto>> FilterOutDuplicatesAsync(IEnumerable<TransactionDto> transactionDtos)
    {
        var tagged = await IdentifyDuplicatesAsync(transactionDtos);
        return tagged.Where(t => !t.IsDuplicate).ToList();
    }

    public async Task<List<TransactionDto>> IdentifyDuplicatesAsync(IEnumerable<TransactionDto> transactionDtos)
    {
        var dtoList = transactionDtos.ToList();
        if (!dtoList.Any()) return new List<TransactionDto>();

        _logger.LogDebug("Identifying duplicates from {Count} transactions.", dtoList.Count);

        var wallets = dtoList.Select(t => t.Wallet).Distinct().ToList();
        var minDate = dtoList.Min(t => t.Date).AddDays(-1);
        var maxDate = dtoList.Max(t => t.Date).AddDays(1);

        // Fetch only relevant transactions from DB (performance + accuracy)
        var result = await _supabase.From<Transaction>()
            .Filter("date", Operator.GreaterThanOrEqual, minDate)
            .Filter("date", Operator.LessThanOrEqual, maxDate)
            .Order("date", Ordering.Descending) // Prioritize checking against recent data
            .Range(0, 1000_000) // Significantly increased range
            .Get();

        _logger.LogInformation("Fetched {DbCount} potential duplicates from DB for date range {Min} to {Max}", result.Models.Count, minDate, maxDate);

        var taggedTransactions = TagDuplicatesLogic(dtoList, result.Models, _logger);
            
        _logger.LogInformation("Identified {DuplicateCount} duplicates out of {TotalCount} transactions.", 
            taggedTransactions.Count(t => t.IsDuplicate), taggedTransactions.Count);
        return taggedTransactions;
    }

    /// <summary>
    /// Pure logic for tagging transactions as duplicates. Extracted for unit testing.
    /// </summary>
    public static List<TransactionDto> TagDuplicatesLogic(List<TransactionDto> incoming, List<Transaction> existing, ILogger? logger = null)
    {
        // Build lookup based on the Regular Key (core attributes)
        var existingRegularLookup = existing.ToLookup(GetRegularKey);
        
        var seenInBatch = new List<TransactionDto>();

        foreach (var t in incoming)
        {
            var regularKey = GetRegularKey(t);
            
            // 1. Check against Database (Tiered Logic)
            var dbMatches = existingRegularLookup[regularKey];
            bool isDuplicate = dbMatches.Any(m => IsMatch(m, t));

            // 2. Check against current batch (Intra-batch deduplication)
            if (!isDuplicate)
            {
                isDuplicate = seenInBatch.Any(s => GetRegularKey(s) == regularKey && IsMatch(s, t));
            }

            t.IsDuplicate = isDuplicate;
            
            if (isDuplicate)
            {
                logger?.LogInformation("Identified duplicate: {Date:u} | {Amount} | {Desc}", t.Date, t.AmountIdr, t.Description);
            }
            else
            {
                seenInBatch.Add(t);
            }
        }
        return incoming;
    }

    private static bool IsMatch(Transaction db, TransactionDto incoming)
    {
        // Tiered logic:
        // - If both have balances, they must match.
        // - If either lacks a balance, we fall back to the Regular Key (which already matched if we are here).
        if (!db.BankRunningBalance.HasValue || !incoming.BankRunningBalance.HasValue)
            return true;

        return Math.Abs(db.BankRunningBalance.Value - incoming.BankRunningBalance.Value) < 0.01m;
    }

    private static bool IsMatch(TransactionDto seen, TransactionDto incoming)
    {
        if (!seen.BankRunningBalance.HasValue || !incoming.BankRunningBalance.HasValue)
            return true;

        return Math.Abs(seen.BankRunningBalance.Value - incoming.BankRunningBalance.Value) < 0.01m;
    }

    private static string GetRegularKey(TransactionDto t)
    {
        var date = StandardizeDate(t.Date);
        var amountStr = Math.Round(t.AmountIdr, 2).ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
        var desc = AggressiveNormalize(t.Description);
        var wallet = (string.IsNullOrWhiteSpace(t.Wallet) || t.Wallet == "-") ? "unknown" : t.Wallet.Trim().ToLower();
        
        return $"{date:yyyy-MM-dd HH:mm:ss}|{amountStr}|{desc}|{wallet}|{t.Flow}";
    }

    private static string GetRegularKey(Transaction t)
    {
        var date = StandardizeDate(t.Date);
        var amountStr = Math.Round(t.AmountIdr, 2).ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
        var desc = AggressiveNormalize(t.Description);
        var wallet = (string.IsNullOrWhiteSpace(t.Wallet) || t.Wallet == "-") ? "unknown" : t.Wallet.Trim().ToLower();

        return $"{date:yyyy-MM-dd HH:mm:ss}|{amountStr}|{desc}|{wallet}|{t.Flow}";
    }

    private static string AggressiveNormalize(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        
        // Remove all multiple spaces, tabs, and newlines inside the string
        // "Initial  Balance" -> "initial balance"
        var normalized = System.Text.RegularExpressions.Regex.Replace(input.Trim().ToLower(), @"\s+", " ");
        return normalized;
    }

    private static DateTime StandardizeDate(DateTime date)
    {
        if (date.Kind == DateTimeKind.Utc) return date;
        
        // If it's Local or Unspecified (common from DB drivers), convert to UTC
        var localDate = date.Kind == DateTimeKind.Unspecified 
            ? DateTime.SpecifyKind(date, DateTimeKind.Local) 
            : date;
            
        return localDate.ToUniversalTime();
    }

    public async Task<List<TransactionDto>> GetTransactionsWithBalanceAsync(
        string? wallet = null,
        string? search = null,
        string? category = null,
        string? type = null)
    {
        // Simple latest-first fetch from the database. 
        // Balance calculation is disabled to ensure pagination and sorting work correctly across large datasets.
        var query = _supabase.From<Transaction>()
            .Order("date", Ordering.Descending)
            .Order("id", Ordering.Descending)
            .Range(0, 100_000); 

        if (!string.IsNullOrEmpty(wallet))   query = query.Filter("wallet",      Operator.Equals,  wallet!);
        if (!string.IsNullOrEmpty(category)) query = query.Filter("category",    Operator.Equals,  category!);
        if (!string.IsNullOrEmpty(type))     query = query.Filter("type",        Operator.Equals,  type!);
        if (!string.IsNullOrEmpty(search))   query = query.Filter("description", Operator.ILike,   $"%{search}%");

        var result = await query.Get();

        return result.Models.Select(t =>
        {
            var dto = MapToDto(t);
            dto.Balance = 0; // Calculation disabled
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

    public async Task<PagedResult<TransactionDto>> GetTransactionPageAsync(
        int page,
        int pageSize,
        string? wallet = null,
        string? search = null,
        string? category = null,
        string? type = null,
        string sortOrder = "desc")
    {
        // Build base query for count
        IPostgrestTable<Transaction> countQuery = _supabase.From<Transaction>();
        if (!string.IsNullOrEmpty(wallet))   countQuery = countQuery.Filter("wallet", Operator.Equals, wallet!);
        if (!string.IsNullOrEmpty(category)) countQuery = countQuery.Filter("category", Operator.Equals, category!);
        if (!string.IsNullOrEmpty(type))     countQuery = countQuery.Filter("type", Operator.Equals, type!);
        if (!string.IsNullOrEmpty(search))   countQuery = countQuery.Filter("description", Operator.ILike, $"%{search}%");

        // Get total count
        var countResult = await countQuery.Get();
        int totalCount = (int)countResult.Count;

        var from = (page - 1) * pageSize;
        var to = from + pageSize - 1;

        if (from >= totalCount)
        {
            return new PagedResult<TransactionDto>
            {
                Items = new List<TransactionDto>(),
                Total = totalCount,
                Page = page,
                PageSize = pageSize,
            };
        }

        // Build paged query
        IPostgrestTable<Transaction> query = _supabase.From<Transaction>();
        if (sortOrder == "asc")
            query = query.Order("date", Ordering.Ascending).Order("id", Ordering.Ascending);
        else
            query = query.Order("date", Ordering.Descending).Order("id", Ordering.Descending);

        if (!string.IsNullOrEmpty(wallet))   query = query.Filter("wallet", Operator.Equals, wallet!);
        if (!string.IsNullOrEmpty(category)) query = query.Filter("category", Operator.Equals, category!);
        if (!string.IsNullOrEmpty(type))     query = query.Filter("type", Operator.Equals, type!);
        if (!string.IsNullOrEmpty(search))   query = query.Filter("description", Operator.ILike, $"%{search}%");

        var result = await query.Range(from, to).Get();

        _logger.LogDebug(
            "GetTransactionPageAsync page={Page} size={Size} total={Total}",
            page, pageSize, result.Count);

        return new PagedResult<TransactionDto>
        {
            Items = result.Models.Select(MapToDto).ToList(),
            Total = totalCount,
            Page = page,
            PageSize = pageSize,
        };
    }

    public async Task<bool> IsFileProcessedAsync(string fileHash)
    {
        var result = await _supabase.From<UploadedFile>()
            .Filter("file_hash", Operator.Equals, fileHash)
            .Get();
        return result.Models.Any();
    }

    public async Task RegisterFileHashAsync(string fileHash, string fileName)
    {
        var entry = new UploadedFile { FileHash = fileHash, FileName = fileName };
        await _supabase.From<UploadedFile>().Insert(entry);
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
        ExchangeRate = dto.ExchangeRate,
        BankRunningBalance = dto.BankRunningBalance
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
        ExchangeRate = t.ExchangeRate,
        BankRunningBalance = t.BankRunningBalance
    };
}
