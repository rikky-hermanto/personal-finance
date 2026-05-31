using MediatR;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;
using Supabase.Postgrest.Interfaces;
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

        try
        {
            var result = await _supabase.From<Transaction>().Insert(entities);
            _logger.LogInformation("Supabase confirmed {ConfirmedCount} of {RequestedCount} transactions inserted.", result.Models.Count, entities.Count);
            return result.Models.Select(t => MapToDto(t)).ToList();
        }
        catch (Exception ex) when (ex.Message.Contains("23505"))
        {
            _logger.LogWarning("Unique constraint violation during bulk insert. Some transactions might be duplicates.");
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

        var minDate = dtoList.Min(t => t.Date).AddDays(-1);
        var maxDate = dtoList.Max(t => t.Date).AddDays(1);

        var result = await _supabase.From<Transaction>()
            .Filter("date", Operator.GreaterThanOrEqual, minDate)
            .Filter("date", Operator.LessThanOrEqual, maxDate)
            .Order("date", Ordering.Descending)
            .Range(0, 1000_000)
            .Get();

        _logger.LogInformation("Fetched {DbCount} potential duplicates from DB for date range {Min} to {Max}", result.Models.Count, minDate, maxDate);

        var taggedTransactions = TagDuplicatesLogic(dtoList, result.Models, _logger);

        _logger.LogInformation("Identified {DuplicateCount} duplicates out of {TotalCount} transactions.",
            taggedTransactions.Count(t => t.IsDuplicate), taggedTransactions.Count);
        return taggedTransactions;
    }

    public static List<TransactionDto> TagDuplicatesLogic(List<TransactionDto> incoming, List<Transaction> existing, ILogger? logger = null)
    {
        var existingRegularLookup = existing.ToLookup(GetRegularKey);
        var seenInBatch = new List<TransactionDto>();

        foreach (var t in incoming)
        {
            var regularKey = GetRegularKey(t);

            var dbMatches = existingRegularLookup[regularKey];
            bool isDuplicate = dbMatches.Any(m => IsMatch(m, t));

            if (!isDuplicate)
                isDuplicate = seenInBatch.Any(s => GetRegularKey(s) == regularKey && IsMatch(s, t));

            t.IsDuplicate = isDuplicate;

            if (isDuplicate)
                logger?.LogInformation("Identified duplicate: {Date:u} | {Amount} | {Desc}", t.Date, t.AmountIdr, t.Description);
            else
                seenInBatch.Add(t);
        }
        return incoming;
    }

    public static List<TransactionDto> FilterLogic(List<TransactionDto> incoming, List<Transaction> existing)
    {
        var tagged = TagDuplicatesLogic(incoming, existing);
        return tagged.Where(t => !t.IsDuplicate).ToList();
    }

    /// <summary>
    /// In-memory mirror of the SQL window function in v_transactions_with_balance.
    /// CR adds amount_idr to the running total; DB subtracts. Rows are ordered by date then id,
    /// matching the ORDER BY in the VIEW. Used in unit tests to validate sign convention and
    /// decimal precision independently of PostgreSQL.
    /// </summary>
    public static IReadOnlyList<(TransactionDto Transaction, decimal Balance)> ComputeRunningBalances(
        IEnumerable<TransactionDto> transactions)
    {
        var sorted = transactions
            .OrderBy(t => t.Date)
            .ThenBy(t => t.Id)
            .ToList();

        var result = new List<(TransactionDto, decimal)>(sorted.Count);
        decimal running = 0m;
        foreach (var t in sorted)
        {
            running += t.Flow == "CR" ? t.AmountIdr : -t.AmountIdr;
            result.Add((t, running));
        }
        return result;
    }

    private static bool IsMatch(Transaction db, TransactionDto incoming)
    {
        if (!db.StatementBalance.HasValue || !incoming.StatementBalance.HasValue)
            return true;
        return Math.Abs(db.StatementBalance.Value - incoming.StatementBalance.Value) < 0.01m;
    }

    private static bool IsMatch(TransactionDto seen, TransactionDto incoming)
    {
        if (!seen.StatementBalance.HasValue || !incoming.StatementBalance.HasValue)
            return true;
        return Math.Abs(seen.StatementBalance.Value - incoming.StatementBalance.Value) < 0.01m;
    }

    private static string GetRegularKey(TransactionDto t)
    {
        var date = StandardizeDate(t.Date);
        var amountStr = Math.Round(t.AmountIdr, 2).ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
        var desc = AggressiveNormalize(t.Description);
        return $"{date:yyyy-MM-dd HH:mm:ss}|{amountStr}|{desc}|{t.AccountId}|{t.Flow}";
    }

    private static string GetRegularKey(Transaction t)
    {
        var date = StandardizeDate(t.Date);
        var amountStr = Math.Round(t.AmountIdr, 2).ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
        var desc = AggressiveNormalize(t.Description);
        return $"{date:yyyy-MM-dd HH:mm:ss}|{amountStr}|{desc}|{t.AccountId}|{t.Flow}";
    }

    private static string AggressiveNormalize(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        return System.Text.RegularExpressions.Regex.Replace(input.Trim().ToLower(), @"\s+", " ");
    }

    private static DateTime StandardizeDate(DateTime date)
    {
        if (date.Kind == DateTimeKind.Utc) return date;
        var localDate = date.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(date, DateTimeKind.Local)
            : date;
        return localDate.ToUniversalTime();
    }

    public async Task<List<TransactionDto>> GetTransactionsWithBalanceAsync(
        Guid? accountId = null,
        string? search = null,
        string? category = null,
        string? type = null)
    {
        var query = _supabase.From<Transaction>()
            .Order("date", Ordering.Descending)
            .Order("id", Ordering.Descending)
            .Range(0, 100_000);

        if (accountId.HasValue)  query = query.Filter("account_id", Operator.Equals, accountId.Value.ToString());
        if (!string.IsNullOrEmpty(category)) query = query.Filter("category",    Operator.Equals, category!);
        if (!string.IsNullOrEmpty(type))     query = query.Filter("type",        Operator.Equals, type!);
        if (!string.IsNullOrEmpty(search))   query = query.Filter("description", Operator.ILike,  $"%{search}%");

        var result = await query.Get();
        var accountNames = await FetchAccountNameLookupAsync();

        return result.Models.Select(t =>
        {
            var dto = MapToDto(t, accountNames);
            dto.Balance = 0;
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
        Guid? accountId = null,
        string? search = null,
        string? category = null,
        string? type = null,
        string sortOrder = "desc")
    {
        IPostgrestTable<Transaction> countQuery = _supabase.From<Transaction>();
        if (accountId.HasValue)          countQuery = countQuery.Filter("account_id", Operator.Equals, accountId.Value.ToString());
        if (!string.IsNullOrEmpty(category)) countQuery = countQuery.Filter("category", Operator.Equals, category!);
        if (!string.IsNullOrEmpty(type))     countQuery = countQuery.Filter("type",     Operator.Equals, type!);
        if (!string.IsNullOrEmpty(search))   countQuery = countQuery.Filter("description", Operator.ILike, $"%{search}%");

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

        IPostgrestTable<TransactionWithBalance> query = _supabase.From<TransactionWithBalance>();
        if (sortOrder == "asc")
            query = query.Order("date", Ordering.Ascending).Order("id", Ordering.Ascending);
        else
            query = query.Order("date", Ordering.Descending).Order("id", Ordering.Descending);

        if (accountId.HasValue)          query = query.Filter("account_id", Operator.Equals, accountId.Value.ToString());
        if (!string.IsNullOrEmpty(category)) query = query.Filter("category", Operator.Equals, category!);
        if (!string.IsNullOrEmpty(type))     query = query.Filter("type",     Operator.Equals, type!);
        if (!string.IsNullOrEmpty(search))   query = query.Filter("description", Operator.ILike, $"%{search}%");

        var result = await query.Range(from, to).Get();
        var accountNames = await FetchAccountNameLookupAsync();

        _logger.LogDebug("GetTransactionPageAsync page={Page} size={Size} total={Total}", page, pageSize, result.Count);

        return new PagedResult<TransactionDto>
        {
            Items = result.Models.Select(t =>
            {
                var dto = MapToDto(t, accountNames);
                dto.Balance = t.RunningBalance ?? 0m;
                return dto;
            }).ToList(),
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

    public async Task<Guid?> ResolveAliasAsync(string walletText)
    {
        if (string.IsNullOrWhiteSpace(walletText)) return null;

        var result = await _supabase.From<WalletAccountAlias>()
            .Filter("alias_text", Operator.Equals, walletText.Trim())
            .Order("created_at", Ordering.Descending)
            .Limit(1)
            .Get();

        return result.Models.FirstOrDefault()?.AccountId;
    }

    public async Task<Dictionary<string, Guid>> ResolveAliasesBatchAsync(IEnumerable<string> walletTexts)
    {
        var texts = walletTexts
            .Select(w => w.Trim())
            .Where(w => !string.IsNullOrEmpty(w))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (texts.Count == 0)
            return new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);

        var all = await _supabase.From<WalletAccountAlias>().Get();
        return all.Models
            .Where(a => texts.Contains(a.AliasText.Trim(), StringComparer.OrdinalIgnoreCase))
            .GroupBy(a => a.AliasText.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(a => a.CreatedAt).First().AccountId,
                StringComparer.OrdinalIgnoreCase);
    }

    public async Task UpsertAliasAsync(string walletText, Guid accountId)
    {
        if (string.IsNullOrWhiteSpace(walletText)) return;

        try
        {
            await _supabase.From<WalletAccountAlias>().Insert(new WalletAccountAlias
            {
                AliasText = walletText.Trim(),
                AccountId = accountId,
            });
        }
        catch (Exception ex) when (ex.Message.Contains("23505"))
        {
            // Alias pair already exists — no-op
        }
    }

    private static Transaction MapToEntity(TransactionDto dto) => new()
    {
        Date = dto.Date,
        Description = dto.Description,
        Remarks = dto.Remarks,
        Flow = dto.Flow,
        Type = dto.Type,
        Category = dto.Category,
        AccountId = dto.AccountId,
        AmountIdr = dto.AmountIdr,
        Currency = dto.Currency,
        ExchangeRate = dto.ExchangeRate,
        StatementBalance = dto.StatementBalance
    };

    private async Task<Dictionary<Guid, string>> FetchAccountNameLookupAsync()
    {
        var accounts = await _supabase.From<Account>().Get();
        return accounts.Models.ToDictionary(a => a.Id, a => a.Name);
    }

    private static TransactionDto MapToDto(Transaction t, Dictionary<Guid, string>? accountNames = null) => new()
    {
        Id = t.Id,
        Date = t.Date,
        Description = t.Description,
        Remarks = t.Remarks,
        Flow = t.Flow,
        Type = t.Type,
        Category = t.Category,
        AccountId = t.AccountId,
        AccountName = t.AccountId.HasValue && accountNames != null && accountNames.TryGetValue(t.AccountId.Value, out var name) ? name : string.Empty,
        AmountIdr = t.AmountIdr,
        Currency = t.Currency,
        ExchangeRate = t.ExchangeRate,
        StatementBalance = t.StatementBalance
    };
}
