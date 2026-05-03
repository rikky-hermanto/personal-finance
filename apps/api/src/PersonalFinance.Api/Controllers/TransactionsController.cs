using System.Globalization;
using CsvHelper;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TransactionsController : ControllerBase
{
    private static readonly HashSet<string> ImageContentTypes =
        ["image/png", "image/jpeg", "image/webp"];

    private readonly IStatementImportService _statementImportService;
    private readonly IBankIdentifier _bankIdentifier;
    private readonly ITransactionService _transactionService;
    private readonly ICategoryRuleService _categoryRuleService;
    private readonly IDashboardService _dashboardService;
    private readonly ILlmExtractionClient _llmClient;
    private readonly IMediator _mediator;
    private readonly IFileStorageService _fileStorageService;
    private readonly ITransactionPipelineService _pipelineService;

    public TransactionsController(
        IStatementImportService statementImportService,
        IBankIdentifier bankIdentifier,
        ITransactionService transactionService,
        ICategoryRuleService categoryRuleService,
        IDashboardService dashboardService,
        ILlmExtractionClient llmClient,
        IMediator mediator,
        IFileStorageService fileStorageService,
        ITransactionPipelineService pipelineService)
    {
        _statementImportService = statementImportService;
        _bankIdentifier = bankIdentifier;
        _transactionService = transactionService;
        _categoryRuleService = categoryRuleService;
        _dashboardService = dashboardService;
        _llmClient = llmClient;
        _mediator = mediator;
        _fileStorageService = fileStorageService;
        _pipelineService = pipelineService;
    }

    [HttpGet("health")]
    public IActionResult HealthCheck()
    {
        return Ok(new { status = "Healthy" });
    }

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
            List<TransactionDto> transactions;

            if (ImageContentTypes.Contains(file.ContentType))
            {
                using var imgStream = file.OpenReadStream();
                transactions = await _llmClient.ParseImageAsync(imgStream, file.FileName, file.ContentType, bankHint);
            }
            else
            {
                using var mainStream = new MemoryStream();
                await file.CopyToAsync(mainStream);
                using var preStream = file.OpenReadStream();

                var bank = await _bankIdentifier.IdentifyAsync(preStream, file.ContentType, pdfPassword);
                if (bank == null)
                    return BadRequest(new { Message = "Bank format not recognised. Supported: BCA, NeoBank, Superbank, Wise." });

                mainStream.Position = 0;
                transactions = await _statementImportService.ImportAsync(mainStream, bank, pdfPassword, dateFormat);
            }

            var nonDuplicates = await _transactionService.FilterOutDuplicatesAsync(transactions);
            return Ok(nonDuplicates);
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

            // 1. Upload to Supabase Storage FIRST
            var filename = $"{Guid.NewGuid()}_{file.FileName}";
            var userId = "default-user"; // Will be replaced by real auth UID later
            var storagePath = await _fileStorageService.UploadAsync(userId, bank, filename, fileStream, file.ContentType);

            if (isImageOrPdf)
            {
                // PDF/image path: upload -> store -> return { processing_id } immediately
                return Accepted(new { processing_id = storagePath, message = "File uploaded and is processing asynchronously." });
            }

            // CSV path: download from storage -> parse -> validate -> return preview
            var downloadedStream = await _fileStorageService.DownloadAsync(storagePath);
            if (downloadedStream == null)
                return StatusCode(500, new { Message = "Failed to retrieve file from storage." });

            var transactions = await _statementImportService.ImportAsync(downloadedStream, bank, pdfPassword, dateFormat);
            
            // Validation Pipeline
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
    public async Task<IActionResult> SubmitTransactions([FromBody] List<TransactionDto> transactions)
    {
        if (transactions == null || transactions.Count == 0)
            return BadRequest("No transactions to submit.");

        await _categoryRuleService.EnsureCategoryRulesAsync(transactions);

        var addedTransactions = await _transactionService.AddTransactionsAsync(transactions);

        return Ok(new
        {
            Message = $"{addedTransactions.Count} transactions imported successfully.",
            Transactions = addedTransactions
        });
    }

    // List transactions — server-side paginated, filtered, ordered newest-first by default.
    [HttpGet]
    public async Task<IActionResult> GetTransactions(
        [FromQuery] string? wallet   = null,
        [FromQuery] string? category = null,
        [FromQuery] string? type     = null,
        [FromQuery] string? search   = null,
        [FromQuery] string sortOrder = "desc",
        [FromQuery] int    page      = 1,
        [FromQuery] int    pageSize  = 50)
    {
        pageSize = Math.Clamp(pageSize, 1, 200);
        page     = Math.Max(page, 1);

        var result = await _transactionService.GetTransactionPageAsync(
            page, pageSize, wallet, search, category, type, sortOrder);

        return Ok(result);
    }

    // Get details for a specific transaction by ID
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetTransactionById(int id)
    {
        // You need to add this method to your ITransactionService and implementation.
        var transaction = await _transactionService.GetTransactionByIdAsync(id);
        if (transaction == null)
            return NotFound();
        return Ok(transaction);
    }

    // Dashboard endpoint - get aggregated data for dashboard
    [HttpGet("aggregated")]
    public async Task<IActionResult> GetDashboardData(
        [FromQuery] string? wallet = null, [FromQuery] int? year = null, [FromQuery] int? month = null, [FromQuery] int months = 6)
    {
        var data = await _dashboardService.GetDashboardDataAsync(wallet, year, month, months);
        return Ok(data);
    }

    [HttpGet("export")]
    public async Task<IActionResult> ExportCsv(
        [FromQuery] string? wallet,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var transactions = await _transactionService.GetTransactionsWithBalanceAsync(wallet);

        if (from.HasValue)
            transactions = transactions.Where(t => t.Date >= from.Value).ToList();
        if (to.HasValue)
            transactions = transactions.Where(t => t.Date <= to.Value).ToList();

        var stream = new MemoryStream();
        using (var writer = new StreamWriter(stream, leaveOpen: true))
        using (var csv = new CsvWriter(writer, CultureInfo.InvariantCulture))
        {
            foreach (var header in new[] { "Date", "Item", "Remarks", "Flow", "Type", "Category", "Wallet", "Amount", "Exc. Rate", "Amount (IDR)", "Currency" })
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
                csv.WriteField(t.Wallet);
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
}
