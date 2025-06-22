using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Infrastructure.Parsers;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Api.Models;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TransactionsController : ControllerBase
{
    private readonly IStatementImportService _statementImportService;
    private readonly IBankIdentifier _bankIdentifier;
    private readonly ITransactionService _transactionService;
    private readonly ICategoryRuleService _categoryRuleService;

    public TransactionsController(
        IStatementImportService statementImportService,
        IBankIdentifier bankIdentifier,
        ITransactionService transactionService,
        ICategoryRuleService categoryRuleService)
    {
        _statementImportService = statementImportService;
        _bankIdentifier = bankIdentifier;
        _transactionService = transactionService;
        _categoryRuleService = categoryRuleService;
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
            new { Bank = "Wise", Types = new[] { "text/csv", "application/pdf" } }
        };
        return Ok(supported);
    }

    [HttpPost("upload")]
    public async Task<IActionResult> UploadFile(IFormFile file, [FromForm]string? pdfPassword = null)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File is empty");

        var allowedContentTypes = new[]
        {
            "text/csv",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword"
        };

        if (!allowedContentTypes.Contains(file.ContentType))
            return BadRequest("Unsupported file type");

        using var mainStream = new MemoryStream();
        await file.CopyToAsync(mainStream);
        using var preStream = file.OpenReadStream();

        var bank = await _bankIdentifier.IdentifyAsync(preStream, file.ContentType, pdfPassword);
        if (bank == null)
            return BadRequest("Bank format not recognized or not supported.");

        mainStream.Position = 0;

        try
        {
            var transactions = await _statementImportService.ImportAsync(mainStream, bank, pdfPassword);

            // Persist and return only added transactions
            List<Transaction> addedTransactions = new();
            if (transactions.Count > 0)
                addedTransactions = await _transactionService.AddTransactionsAsync(transactions);

            // Calculate running balance for only the added transactions
            var allWalletTransactions = await _transactionService.GetTransactionsWithBalanceAsync(
                addedTransactions.FirstOrDefault()?.Wallet ?? string.Empty
            );

            // Map only the added transactions to their DTOs with balance
            var addedTransactionIds = addedTransactions.Select(t => t.Id).ToHashSet();
            var addedDtos = allWalletTransactions
                .Where(dto => addedTransactionIds.Contains(dto.Id))
                .ToList();

            return Ok(addedDtos);
        }
        catch (NotSupportedException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Failed to parse file: {ex.Message}");
        }
    }

    [HttpPost("upload-preview")]
    public async Task<IActionResult> UploadPreview(IFormFile file, [FromForm] string? pdfPassword = null)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File is empty");

        var allowedContentTypes = new[] { "text/csv", "application/pdf" };
        if (!allowedContentTypes.Contains(file.ContentType))
            return BadRequest("Unsupported file type");

        using var mainStream = new MemoryStream();
        await file.CopyToAsync(mainStream);
        using var preStream = file.OpenReadStream();

        var bank = await _bankIdentifier.IdentifyAsync(preStream, file.ContentType, pdfPassword);
        if (bank == null)
            return BadRequest("Bank format not recognized or not supported.");

        mainStream.Position = 0;

        try
        {
            var transactions = await _statementImportService.ImportAsync(mainStream, bank, pdfPassword);

            // Filter out duplicates before preview
            var nonDuplicateTransactions = await _transactionService.FilterOutDuplicatesAsync(transactions);

            // Map to DTOs for preview (no persistence)
            var previewDtos = nonDuplicateTransactions.Select(t => new TransactionDto
            {
                Id = 0,
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
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Failed to parse file: {ex.Message}");
        }
    }

    [HttpPost("submit")]
    public async Task<IActionResult> SubmitTransactions([FromBody] List<TransactionDto> transactions)
    {
        if (transactions == null || transactions.Count == 0)
            return BadRequest("No transactions to submit.");

        // Implicitly add new categories if not existed
        foreach (var dto in transactions)
        {
            if (!string.IsNullOrWhiteSpace(dto.Category))
            {
                // Check if category rule exists for this description/type/category
                var existing = (await _categoryRuleService.GetAllAsync())
                    .Any(r => r.Category == dto.Category && r.Type == dto.Type);

                if (!existing)
                {
                    // Add new rule with keyword = description for best match
                    await _categoryRuleService.AddAsync(new CategoryRule
                    {
                        Keyword = dto.Description,
                        Type = dto.Type,
                        Category = dto.Category,
                        KeywordLength = dto.Description.Length
                    });
                }
            }
        }

        // Map DTOs to domain entities
        var domainTransactions = transactions.Select(dto => new Transaction
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
        }).ToList();

        var addedTransactions = await _transactionService.AddTransactionsAsync(domainTransactions);

        return Ok(new
        {
            Message = $"{addedTransactions.Count} transactions imported successfully.",
            Transactions = addedTransactions
        });
    }
}
