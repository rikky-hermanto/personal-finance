using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Application.Services;

public class TransactionPipelineService : ITransactionPipelineService
{
    private readonly ITransactionService _transactionService;
    private readonly ILogger<TransactionPipelineService> _logger;

    public TransactionPipelineService(ITransactionService transactionService, ILogger<TransactionPipelineService> logger)
    {
        _transactionService = transactionService;
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
            if (t.Date.Kind == DateTimeKind.Unspecified)
            {
                t.Date = DateTime.SpecifyKind(t.Date, DateTimeKind.Utc);
            }
            else
            {
                t.Date = t.Date.ToUniversalTime();
            }

            // 2. DecimalFixer
            t.AmountIdr = Math.Abs(Math.Round(t.AmountIdr, 2));

            // 3. CurrencyStandardizer
            if (string.IsNullOrWhiteSpace(t.Currency) || t.Currency.Trim().Equals("Rp", StringComparison.OrdinalIgnoreCase) || t.Currency.Trim().Equals("Rp.", StringComparison.OrdinalIgnoreCase))
            {
                t.Currency = "IDR";
            }
            else
            {
                t.Currency = t.Currency.Trim().ToUpper();
            }

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

        // 5. DeduplicateCheck
        var finalTransactions = await _transactionService.FilterOutDuplicatesAsync(validTransactions);

        return finalTransactions;
    }
}
