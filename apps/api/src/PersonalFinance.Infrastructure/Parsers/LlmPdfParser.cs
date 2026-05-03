using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

public class LlmPdfParser : IBankStatementParser
{
    private readonly ILlmExtractionClient _client;
    private readonly ICategoryRuleService _categoryRuleService;
    private readonly ILogger<LlmPdfParser> _logger;

    public LlmPdfParser(
        ILlmExtractionClient client,
        ICategoryRuleService categoryRuleService,
        ILogger<LlmPdfParser> logger)
    {
        _client = client;
        _categoryRuleService = categoryRuleService;
        _logger = logger;
    }

    public async Task<List<TransactionDto>> ParseAsync(Stream fileStream, string? password = null, string? dateFormat = null)
    {
        _logger.LogInformation("Starting LLM PDF extraction.");
        var transactions = await _client.ParsePdfAsync(fileStream, "upload.pdf", bankHint: null, password);
        await _categoryRuleService.CategorizeBatchAsync(transactions);
        _logger.LogInformation("LLM PDF extraction complete. Parsed {Count} transactions.", transactions.Count);
        return transactions;
    }
}
