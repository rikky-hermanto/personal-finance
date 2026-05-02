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
    private readonly IStatementImportService _statementImportService;
    private readonly IBankIdentifier _bankIdentifier;
    private readonly ITransactionService _transactionService;
    private readonly ICategoryRuleService _categoryRuleService;
    private readonly IDashboardService _dashboardService;
    private readonly IMediator _mediator;

    public TransactionsController(
        IStatementImportService statementImportService,
        IBankIdentifier bankIdentifier,
        ITransactionService transactionService,
        ICategoryRuleService categoryRuleService,
        IDashboardService dashboardService,
        IMediator mediator)
    {
        _statementImportService = statementImportService;
        _bankIdentifier = bankIdentifier;
        _transactionService = transactionService;
        _categoryRuleService = categoryRuleService;
        _dashboardService = dashboardService;
        _mediator = mediator;
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
            new { Bank = "BCA", Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "NeoBank", Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "Superbank", Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "Wise", Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "Standard", Types = new[] { "text/csv" } }
        };
        return Ok(supported);
    }

    [HttpPost("upload-preview")]
    public async Task<IActionResult> UploadPreview(IFormFile file, [FromForm] string? pdfPassword = null)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { Message = "File is empty." });

        var allowedContentTypes = new[] { "text/csv", "application/pdf" };
        if (!allowedContentTypes.Contains(file.ContentType))
            return BadRequest(new { Message = "Unsupported file type. Upload a CSV or PDF." });

        using var mainStream = new MemoryStream();
        await file.CopyToAsync(mainStream);
        using var preStream = file.OpenReadStream();

        var bank = await _bankIdentifier.IdentifyAsync(preStream, file.ContentType, pdfPassword);
        if (bank == null)
            return BadRequest(new { Message = "Bank format not recognised. Supported: BCA, NeoBank, Superbank, Wise." });

        mainStream.Position = 0;

        try
        {
            var transactions = await _statementImportService.ImportAsync(mainStream, bank, pdfPassword);

            // Filter out duplicates before preview
            var nonDuplicateTransactions = await _transactionService.FilterOutDuplicatesAsync(transactions);

            // Map to DTOs for preview (no persistence)
            var previewDtos = nonDuplicateTransactions.Select(t => new TransactionDto
            {
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
                Balance = 0 // Not calculated for preview
            }).ToList();

            return Ok(previewDtos);
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
            return StatusCode(422, new { Message = "The AI service could not read this PDF.", Detail = ex.Message });
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

    // List all transactions, with optional filtering by wallet, category, or type
    [HttpGet]
    public async Task<IActionResult> GetTransactions([FromQuery] string? wallet = null, [FromQuery] string? category = null, [FromQuery] string? type = null)
    {
        // You may want to add a new service method for more advanced filtering/paging.
        // For now, use GetTransactionsWithBalanceAsync if wallet is specified, otherwise return all.
        
        var transactions = await _transactionService.GetTransactionsWithBalanceAsync(wallet);
        // Optionally filter by category/type
        if (!string.IsNullOrEmpty(category))
            transactions = transactions.Where(t => t.Category == category).ToList();
        if (!string.IsNullOrEmpty(type))
            transactions = transactions.Where(t => t.Type == type).ToList();
        return Ok(transactions);
       
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
        [FromQuery] string? wallet = null, [FromQuery] int? year = null, [FromQuery] int? month = null)
    {
        var data = await _dashboardService.GetDashboardDataAsync(wallet, year, month);
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
