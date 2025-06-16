using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Infrastructure.Parsers;
using PersonalFinance.Application.Dtos;

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

    [HttpPost("upload")]
    public async Task<IActionResult> UploadFile(IFormFile file)
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

        var bank = await _bankIdentifier.IdentifyAsync(preStream, file.ContentType);
        if (bank == null)
            return BadRequest("Bank format not recognized or not supported.");

        mainStream.Position = 0;

        try
        {
            var transactions = await _statementImportService.ImportAsync(mainStream, bank);

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
}
