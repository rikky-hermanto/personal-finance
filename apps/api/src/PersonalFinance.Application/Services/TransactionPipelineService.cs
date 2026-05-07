using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Application.Services;

public class TransactionPipelineService : ITransactionPipelineService
{
    private readonly ITransactionService _transactionService;
    private readonly ILlmCategorizationClient _llmCategorizer;
    private readonly ICategoryRuleService _categoryRuleService;
    private readonly ILogger<TransactionPipelineService> _logger;

    private const double LlmAutoAcceptThreshold = 0.85;

    public TransactionPipelineService(
        ITransactionService transactionService,
        ILlmCategorizationClient llmCategorizer,
        ICategoryRuleService categoryRuleService,
        ILogger<TransactionPipelineService> logger)
    {
        _transactionService = transactionService;
        _llmCategorizer = llmCategorizer;
        _categoryRuleService = categoryRuleService;
        _logger = logger;
    }

    public async Task<List<TransactionDto>> ProcessAsync(List<TransactionDto> transactions)
    {
        if (transactions == null || !transactions.Any())
            return new List<TransactionDto>();

        var validTransactions = new List<TransactionDto>();

        foreach (var t in transactions)
        {
            // 1. DateNormalizer
            t.Date = t.Date.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(t.Date, DateTimeKind.Utc)
                : t.Date.ToUniversalTime();

            // 2. DecimalFixer
            t.AmountIdr = Math.Abs(Math.Round(t.AmountIdr, 2));

            // 3. CurrencyStandardizer
            if (string.IsNullOrWhiteSpace(t.Currency)
                || t.Currency.Trim().Equals("Rp", StringComparison.OrdinalIgnoreCase)
                || t.Currency.Trim().Equals("Rp.", StringComparison.OrdinalIgnoreCase))
                t.Currency = "IDR";
            else
                t.Currency = t.Currency.Trim().ToUpper();

            // 4. SchemaValidator
            if (string.IsNullOrWhiteSpace(t.Description))
            {
                _logger.LogWarning("Skipping transaction with empty description. Date: {Date}", t.Date);
                continue;
            }
            if (t.AmountIdr == 0)
            {
                _logger.LogWarning("Skipping transaction with 0 amount. Description: {Desc}", t.Description);
                continue;
            }
            if (string.IsNullOrWhiteSpace(t.Flow) || (t.Flow != "CR" && t.Flow != "DB"))
            {
                _logger.LogWarning("Skipping transaction with invalid flow '{Flow}'. Description: {Desc}", t.Flow, t.Description);
                continue;
            }

            validTransactions.Add(t);
        }

        // 4.5. Layer 3: LLM fallback for rows still at "Untracked Expense" after parser's Layers 0+1+2.
        await ApplyLlmCategorizationAsync(validTransactions);

        // 5. DeduplicateCheck
        var finalTransactions = await _transactionService.FilterOutDuplicatesAsync(validTransactions);

        return finalTransactions;
    }

    private async Task ApplyLlmCategorizationAsync(List<TransactionDto> transactions)
    {
        // Only target rows where Category is still at default — meaning neither the source file
        // nor Layers 1+2 supplied a category. Type is NEVER overridden here; the LLM only
        // returns a category, and the source-supplied Type is the user's ground truth.
        var uncategorized = transactions
            .Where(t => t.Category.Equals("Untracked Expense", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (uncategorized.Count == 0) return;

        _logger.LogInformation("Layer 3: {Count} transactions need LLM categorization.", uncategorized.Count);

        // Load available categories once for the batch (used to constrain LLM response).
        var allRules = await _categoryRuleService.GetAllAsync();
        var availableCategories = allRules
            .Select(r => r.Category)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order()
            .ToList();

        if (availableCategories.Count == 0) return;

        foreach (var tx in uncategorized)
        {
            var (category, confidence) = await _llmCategorizer.CategorizeAsync(
                tx.Description, tx.Remarks, tx.Flow, tx.AmountIdr, tx.Wallet,
                availableCategories);

            if (category.Equals("Untracked Expense", StringComparison.OrdinalIgnoreCase))
                continue;

            tx.Category = category;

            // Auto-seed rule when confidence is high — prevents the same transaction
            // from hitting LLM next month.
            if (confidence >= LlmAutoAcceptThreshold)
            {
                _logger.LogInformation(
                    "Auto-seeding rule: keyword='{Desc}', type='{Type}', flow='{Flow}', category='{Cat}' (confidence={Conf:P0})",
                    tx.Description, tx.Type, tx.Flow, category, confidence);

                await _categoryRuleService.AddAsync(new CategoryRuleDto
                {
                    Keyword  = tx.Description,
                    Type     = tx.Type,
                    Flow     = tx.Flow,
                    Category = category
                });
            }
        }
    }
}
