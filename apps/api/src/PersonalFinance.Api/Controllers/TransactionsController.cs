using System.Globalization;
using CsvHelper;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TransactionsController : ControllerBase
{
    private static readonly HashSet<string> ImageContentTypes =
        ["image/png", "image/jpeg", "image/webp"];

    private readonly ILogger<TransactionsController> _logger;
    private readonly IStatementImportService _statementImportService;
    private readonly IBankIdentifier _bankIdentifier;
    private readonly ITransactionService _transactionService;
    private readonly ICategoryRuleService _categoryRuleService;
    private readonly IDashboardService _dashboardService;
    private readonly ILlmExtractionClient _llmClient;
    private readonly IMediator _mediator;
    private readonly IFileStorageService _fileStorageService;
    private readonly ITransactionPipelineService _pipelineService;
    private readonly Supabase.Client _supabase;

    public TransactionsController(
        ILogger<TransactionsController> logger,
        IStatementImportService statementImportService,
        IBankIdentifier bankIdentifier,
        ITransactionService transactionService,
        ICategoryRuleService categoryRuleService,
        IDashboardService dashboardService,
        ILlmExtractionClient llmClient,
        IMediator mediator,
        IFileStorageService fileStorageService,
        ITransactionPipelineService pipelineService,
        Supabase.Client supabase)
    {
        _logger = logger;
        _statementImportService = statementImportService;
        _bankIdentifier = bankIdentifier;
        _transactionService = transactionService;
        _categoryRuleService = categoryRuleService;
        _dashboardService = dashboardService;
        _llmClient = llmClient;
        _mediator = mediator;
        _fileStorageService = fileStorageService;
        _pipelineService = pipelineService;
        _supabase = supabase;
    }

    [HttpGet("health")]
    public IActionResult HealthCheck() => Ok(new { status = "Healthy" });

    [HttpGet("supported-types")]
    public IActionResult GetSupportedTypes()
    {
        var supported = new[]
        {
            new { Bank = "BCA",       Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "NeoBank",   Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "Superbank", Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "Wise",      Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "BankJago",  Types = new[] { "image/png", "image/jpeg", "image/webp" } },
            new { Bank = "Standard",  Types = new[] { "text/csv" } }
        };
        return Ok(supported);
    }

    [HttpPost("upload-preview")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadPreview(
        IFormFile file,
        [FromForm] string? pdfPassword = null,
        [FromForm] string? bankHint = null,
        [FromForm] string? dateFormat = null)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { Message = "File is empty." });

        var allowedContentTypes = new[] { "text/csv", "application/pdf", "image/png", "image/jpeg", "image/webp" };
        if (!allowedContentTypes.Contains(file.ContentType))
            return BadRequest(new { Message = "Unsupported file type. Upload a CSV, PDF, or screenshot (PNG/JPEG/WEBP)." });

        try
        {
            using var mainStream = new MemoryStream();
            await file.CopyToAsync(mainStream);
            mainStream.Position = 0;

            var hash = CalculateFileHash(mainStream);
            mainStream.Position = 0;

            _logger.LogInformation("File uploaded: {FileName}, Hash: {Hash}", file.FileName, hash);

            if (await _transactionService.IsFileProcessedAsync(hash))
            {
                _logger.LogWarning("File already processed: {Hash}", hash);
                return Conflict(new { Message = "This file has already been processed.", Hash = hash });
            }

            List<TransactionDto> transactions;

            if (ImageContentTypes.Contains(file.ContentType))
            {
                transactions = await _llmClient.ParseImageAsync(mainStream, file.FileName, file.ContentType, bankHint);
            }
            else
            {
                var bank = await _bankIdentifier.IdentifyAsync(mainStream, file.ContentType, pdfPassword);
                if (bank == null)
                    return BadRequest(new { Message = "Bank format not recognised. Supported: BCA, NeoBank, Superbank, Wise." });

                mainStream.Position = 0;
                transactions = await _statementImportService.ImportAsync(mainStream, bank, pdfPassword, dateFormat);
            }

            // Auto-resolve account_id from wallet text — alias lookup, then name match, then null
            if (transactions.Any())
            {
                var walletText = transactions.First().Wallet;
                var resolvedAccountId = await AutoResolveAccountIdAsync(walletText);
                if (resolvedAccountId.HasValue)
                {
                    _logger.LogInformation("Auto-resolved account_id {AccountId} for wallet '{Wallet}'", resolvedAccountId, walletText);
                    foreach (var tx in transactions)
                        tx.AccountId = resolvedAccountId;
                }
            }

            var allTransactions = await _transactionService.IdentifyDuplicatesAsync(transactions);
            return Ok(new { Transactions = allTransactions, Hash = hash });
        }
        catch (NotSupportedException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (PersonalFinance.Infrastructure.External.LlmExtractionException ex) when (ex.IsTransient)
        {
            Response.Headers.Append("Retry-After", "30");
            return StatusCode(503, new { Message = ex.Message });
        }
        catch (PersonalFinance.Infrastructure.External.LlmExtractionException ex)
        {
            return StatusCode(422, new { Message = "The AI service could not read this file.", Detail = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { Message = "File processing failed. Check the file is a valid bank statement and try again.", Detail = ex.Message });
        }
    }

    [HttpPost("upload-preview-new")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadPreviewNEW(
        IFormFile file,
        [FromForm] string? pdfPassword = null,
        [FromForm] string? bankHint = null,
        [FromForm] string? dateFormat = null)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { Message = "File is empty." });

        var allowedContentTypes = new[] { "text/csv", "application/pdf", "image/png", "image/jpeg", "image/webp" };
        if (!allowedContentTypes.Contains(file.ContentType))
            return BadRequest(new { Message = "Unsupported file type. Upload a CSV, PDF, or screenshot (PNG/JPEG/WEBP)." });

        try
        {
            var isImageOrPdf = ImageContentTypes.Contains(file.ContentType) || file.ContentType == "application/pdf";

            using var fileStream = new MemoryStream();
            await file.CopyToAsync(fileStream);
            fileStream.Position = 0;

            string bank = "UNKNOWN";
            if (!isImageOrPdf)
            {
                var idBank = await _bankIdentifier.IdentifyAsync(fileStream, file.ContentType, pdfPassword);
                if (idBank == null)
                    return BadRequest(new { Message = "Bank format not recognised. Supported: BCA, NeoBank, Superbank, Wise." });
                bank = idBank;
                fileStream.Position = 0;
            }
            else
            {
                bank = bankHint ?? "UNKNOWN";
            }

            var filename = $"{Guid.NewGuid()}_{file.FileName}";
            var userId = "default-user";
            var storagePath = await _fileStorageService.UploadAsync(userId, bank, filename, fileStream, file.ContentType);

            if (isImageOrPdf)
                return Accepted(new { processing_id = storagePath, message = "File uploaded and is processing asynchronously." });

            var downloadedStream = await _fileStorageService.DownloadAsync(storagePath);
            if (downloadedStream == null)
                return StatusCode(500, new { Message = "Failed to retrieve file from storage." });

            var transactions = await _statementImportService.ImportAsync(downloadedStream, bank, pdfPassword, dateFormat);
            var processedTransactions = await _pipelineService.ProcessAsync(transactions);

            return Ok(processedTransactions);
        }
        catch (NotSupportedException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (PersonalFinance.Infrastructure.External.LlmExtractionException ex) when (ex.IsTransient)
        {
            Response.Headers.Append("Retry-After", "30");
            return StatusCode(503, new { Message = ex.Message });
        }
        catch (PersonalFinance.Infrastructure.External.LlmExtractionException ex)
        {
            return StatusCode(422, new { Message = "The AI service could not read this file.", Detail = ex.Message });
        }
        catch (Exception)
        {
            return StatusCode(500, new { Message = "File processing failed. Check the file is a valid bank statement and try again." });
        }
    }

    [HttpPost("submit")]
    public async Task<IActionResult> SubmitTransactions([FromBody] SubmitTransactionsRequest request)
    {
        if (request.Transactions == null || request.Transactions.Count == 0)
            return BadRequest("No transactions to submit.");

        await _categoryRuleService.EnsureCategoryRulesAsync(request.Transactions);

        var nonDuplicates = await _transactionService.FilterOutDuplicatesAsync(request.Transactions);
        if (nonDuplicates.Count == 0)
        {
            return Ok(new
            {
                Message = "All transactions are duplicates. Nothing to import.",
                Transactions = new List<TransactionDto>()
            });
        }

        var addedTransactions = await _transactionService.AddTransactionsAsync(nonDuplicates);

        if (!string.IsNullOrEmpty(request.FileHash))
            await _transactionService.RegisterFileHashAsync(request.FileHash, request.FileName ?? "uploaded_file");

        // Upsert alias: persist wallet → account_id mapping for future auto-resolution
        var first = request.Transactions.FirstOrDefault(t => t.AccountId.HasValue && !string.IsNullOrWhiteSpace(t.Wallet));
        if (first != null)
            await _transactionService.UpsertAliasAsync(first.Wallet, first.AccountId!.Value);

        return Ok(new
        {
            Message = $"{addedTransactions.Count} transactions imported successfully.",
            Transactions = addedTransactions
        });
    }

    public class SubmitTransactionsRequest
    {
        public List<TransactionDto> Transactions { get; set; } = [];
        public string? FileHash { get; set; }
        public string? FileName { get; set; }
    }

    [HttpGet]
    public async Task<IActionResult> GetTransactions(
        [FromQuery] Guid?   accountId = null,
        [FromQuery] string? category  = null,
        [FromQuery] string? type      = null,
        [FromQuery] string? search    = null,
        [FromQuery] string  sortOrder = "desc",
        [FromQuery] int     page      = 1,
        [FromQuery] int     pageSize  = 50)
    {
        pageSize = Math.Clamp(pageSize, 1, 200);
        page     = Math.Max(page, 1);

        var result = await _transactionService.GetTransactionPageAsync(
            page, pageSize, accountId, search, category, type, sortOrder);

        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetTransactionById(int id)
    {
        var transaction = await _transactionService.GetTransactionByIdAsync(id);
        if (transaction == null) return NotFound();
        return Ok(transaction);
    }

    [HttpGet("aggregated")]
    public async Task<IActionResult> GetDashboardData(
        [FromQuery] Guid? accountId = null,
        [FromQuery] int? year = null,
        [FromQuery] int? month = null,
        [FromQuery] int months = 6)
    {
        var data = await _dashboardService.GetDashboardDataAsync(accountId, year, month, months);
        return Ok(data);
    }

    [HttpGet("statement")]
    public async Task<IActionResult> GetCashflowStatement(
        [FromQuery] int months = 6,
        [FromQuery] Guid? accountId = null,
        [FromQuery] string groupBy = "quarterly")
    {
        var data = await _dashboardService.GetCashflowStatementAsync(months, accountId, groupBy);
        return Ok(data);
    }

    [HttpGet("account-summaries")]
    public async Task<IActionResult> GetAccountSummaries([FromQuery] int months = 12)
    {
        var since = DateTime.UtcNow.AddMonths(-months);

        var accountsResult = await _supabase.From<Account>()
            .Filter("include_in_cashflow", Operator.Equals, "true")
            .Order("name", Ordering.Ascending)
            .Get();

        var institutionsResult = await _supabase.From<Institution>()
            .Get();
        var instMap = institutionsResult.Models.ToDictionary(i => i.Id, i => i.Name);

        var txResult = await _supabase.From<Transaction>()
            .Filter("date", Operator.GreaterThanOrEqual, since)
            .Range(0, 100_000)
            .Get();

        var grouped = txResult.Models
            .Where(t => t.AccountId.HasValue)
            .GroupBy(t => t.AccountId!.Value)
            .ToDictionary(
                g => g.Key,
                g => new
                {
                    TotalIn  = g.Where(t => t.Type.Equals("Income",  StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr),
                    TotalOut = g.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).Sum(t => t.AmountIdr),
                    Count    = g.Count()
                });

        var summaries = accountsResult.Models
            .Where(a => grouped.ContainsKey(a.Id))
            .Select(a =>
        {
            grouped.TryGetValue(a.Id, out var stats);
            var totalIn  = stats?.TotalIn  ?? 0m;
            var totalOut = stats?.TotalOut ?? 0m;
            return new
            {
                AccountId       = a.Id,
                AccountName     = a.Name,
                InstitutionId   = a.InstitutionId,
                InstitutionName = a.InstitutionId.HasValue && instMap.TryGetValue(a.InstitutionId.Value, out var n) ? n : string.Empty,
                Currency        = a.Currency,
                TotalIn         = totalIn,
                TotalOut        = totalOut,
                NetPosition     = totalIn - totalOut,
                TransactionCount = stats?.Count ?? 0
            };
        });

        return Ok(summaries);
    }

    [HttpGet("resolve-alias")]
    public async Task<IActionResult> ResolveAlias([FromQuery] string aliasText)
    {
        if (string.IsNullOrWhiteSpace(aliasText)) return BadRequest();

        var accountId = await _transactionService.ResolveAliasAsync(aliasText);
        if (accountId == null) return NotFound();

        var account = await _supabase.From<Account>()
            .Filter("id", Operator.Equals, accountId.Value.ToString())
            .Single();
        if (account == null) return NotFound();

        string institutionName = string.Empty;
        if (account.InstitutionId.HasValue)
        {
            var inst = await _supabase.From<Institution>()
                .Filter("id", Operator.Equals, account.InstitutionId.Value.ToString())
                .Single();
            institutionName = inst?.Name ?? string.Empty;
        }

        return Ok(new { accountId = account.Id, accountName = account.Name, institutionName });
    }

    [HttpGet("export")]
    public async Task<IActionResult> ExportCsv(
        [FromQuery] Guid? accountId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var transactions = await _transactionService.GetTransactionsWithBalanceAsync(accountId);

        if (from.HasValue) transactions = transactions.Where(t => t.Date >= from.Value).ToList();
        if (to.HasValue)   transactions = transactions.Where(t => t.Date <= to.Value).ToList();

        var stream = new MemoryStream();
        using (var writer = new StreamWriter(stream, leaveOpen: true))
        using (var csv = new CsvWriter(writer, CultureInfo.InvariantCulture))
        {
            foreach (var header in new[] { "Date", "Item", "Remarks", "Flow", "Type", "Category", "Bank Account", "Amount", "Exc. Rate", "Amount (IDR)", "Currency" })
                csv.WriteField(header);
            await csv.NextRecordAsync();

            foreach (var t in transactions)
            {
                csv.WriteField(t.Date.ToString("M/d/yy H:mm", CultureInfo.InvariantCulture));
                csv.WriteField(t.Description);
                csv.WriteField(t.Remarks);
                csv.WriteField(t.Flow);
                csv.WriteField(t.Type);
                csv.WriteField(t.Category);
                csv.WriteField(t.AccountId.ToString());
                csv.WriteField(t.AmountIdr);
                csv.WriteField(t.ExchangeRate?.ToString(CultureInfo.InvariantCulture) ?? "");
                csv.WriteField(t.AmountIdr);
                csv.WriteField(t.Currency);
                await csv.NextRecordAsync();
            }
        }

        stream.Position = 0;
        return File(stream, "text/csv", $"transactions-{DateTime.UtcNow:yyyy-MM-dd}.csv");
    }

    [HttpDelete("reset")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    public async Task<IActionResult> ResetAllTransactions()
    {
        var deleted = await _mediator.Send(new DeleteAllTransactionsCommand());
        return Ok(new { deleted });
    }

    private async Task<Guid?> AutoResolveAccountIdAsync(string walletText)
    {
        if (string.IsNullOrWhiteSpace(walletText)) return null;

        var aliasId = await _transactionService.ResolveAliasAsync(walletText);
        if (aliasId.HasValue) return aliasId;

        // Fall back to name match against accounts table
        var accounts = await _supabase.From<Account>().Get();
        var match = accounts.Models.FirstOrDefault(a =>
            a.Name.Contains(walletText, StringComparison.OrdinalIgnoreCase) ||
            walletText.Contains(a.Name, StringComparison.OrdinalIgnoreCase));
        return match?.Id;
    }

    private string CalculateFileHash(Stream stream)
    {
        using var sha256 = System.Security.Cryptography.SHA256.Create();
        var hashBytes = sha256.ComputeHash(stream);
        return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
    }
}
