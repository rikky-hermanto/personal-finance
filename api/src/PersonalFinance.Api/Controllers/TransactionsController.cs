using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TransactionsController : ControllerBase
{
    private readonly ITransactionService _transactionService;

    public TransactionsController(ITransactionService transactionService)
    {
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

        using var stream = file.OpenReadStream();

        if (file.ContentType == "text/csv")
        {
            var transactions = await _transactionService.ImportFromCsvAsync(stream);
            return Ok(transactions);
        }
        else if (file.ContentType == "application/pdf")
        {
            // TODO: Implement PDF processing logic
            return Ok(new { message = "PDF file uploaded successfully." });
        }
        else if (file.ContentType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                 file.ContentType == "application/msword")
        {
            // TODO: Implement Word document processing logic
            return Ok(new { message = "Word file uploaded successfully." });
        }

        return BadRequest("File type not supported.");
    }
}
