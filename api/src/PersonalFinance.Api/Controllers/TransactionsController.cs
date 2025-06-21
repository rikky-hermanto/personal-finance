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

    public TransactionsController(
        IStatementImportService statementImportService,
        IBankIdentifier bankIdentifier,
        ITransactionService transactionService)
    {
        _statementImportService = statementImportService;
        _bankIdentifier = bankIdentifier;
        _transactionService = transactionService;
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

    [HttpPost("upload-multiple")]
    public async Task<IActionResult> UploadMultipleFiles([FromForm] IFormFile[] files, [FromForm] string[]? pdfPasswords = null)
    {
        var results = new List<ParsedFileResult>();
        for (int i = 0; i < files.Length; i++)
        {
            var file = files[i];
            var password = pdfPasswords != null && pdfPasswords.Length > i ? pdfPasswords[i] : null;
            using var stream = file.OpenReadStream();
            var bank = await _bankIdentifier.IdentifyAsync(stream, file.ContentType, password);
            if (bank == null)
            {
                results.Add(new ParsedFileResult { FileName = file.FileName, Error = "Bank format not recognized or not supported." });
                continue;
            }
            stream.Position = 0;
            var transactions = await _statementImportService.ImportAsync(stream, bank, password);
            results.Add(new ParsedFileResult { FileName = file.FileName, Transactions = transactions });
        }
        return Ok(results);
    }

    [HttpPost("validate-files")]
    public async Task<IActionResult> ValidateFiles([FromForm] IFormFile[] files)
    {
        var results = new List<object>();
        foreach (var file in files)
        {
            var result = new
            {
                FileName = file.FileName,
                ContentType = file.ContentType,
                Size = file.Length,
                IsSupportedType = new[] { "text/csv", "application/pdf" }.Contains(file.ContentType),
                IsSizeValid = file.Length <= 10 * 1024 * 1024, // 10MB
                // Optionally: Add more checks, e.g., try reading header for CSV, check PDF encryption, etc.
            };
            results.Add(result);
        }
        return Ok(results);
    }

    [HttpPost("parse")]
    public async Task<IActionResult> ParseFiles([FromForm] IFormFile[] files, [FromForm] string[]? pdfPasswords = null)
    {
        var results = new List<ParsedFileResult>();
        for (int i = 0; i < files.Length; i++)
        {
            var file = files[i];
            var password = pdfPasswords != null && pdfPasswords.Length > i ? pdfPasswords[i] : null;
            using var stream = file.OpenReadStream();
            var bank = await _bankIdentifier.IdentifyAsync(stream, file.ContentType, password);
            if (bank == null)
            {
                results.Add(new ParsedFileResult { FileName = file.FileName, Error = "Bank format not recognized or not supported." });
                continue;
            }
            stream.Position = 0;
            var transactions = await _statementImportService.ImportAsync(stream, bank, password);
            // TODO: Auto-categorize here if needed
            results.Add(new ParsedFileResult { FileName = file.FileName, Transactions = transactions });
        }
        return Ok(results);
    }

    [HttpPost("submit")]
    public async Task<IActionResult> SubmitTransactions([FromBody] List<TransactionDto> transactions)
    {
        if (transactions == null || transactions.Count == 0)
            return BadRequest("No transactions to submit.");

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
