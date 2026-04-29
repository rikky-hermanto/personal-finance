using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using Microsoft.Extensions.Logging;

public class StatementImportService : IStatementImportService
{
    private readonly IDictionary<string, IBankStatementParser> _parsers;
    private readonly ILogger<StatementImportService> _logger;

    public StatementImportService(IDictionary<string, IBankStatementParser> parsers, ILogger<StatementImportService> logger)
    {
        _parsers = new Dictionary<string, IBankStatementParser>(parsers, StringComparer.OrdinalIgnoreCase);
        _logger = logger;
    }

    public async Task<List<TransactionDto>> ImportAsync(Stream stream, string bankCode, string? password = null)
    {
        _logger.LogInformation("Importing statement for bank code: {BankCode}", bankCode);
        if (!_parsers.TryGetValue(bankCode, out var parser))
        {
            _logger.LogWarning("Bank '{BankCode}' is not supported.", bankCode);
            throw new NotSupportedException($"Bank '{bankCode}' is not supported.");
        }

        return await parser.ParseAsync(stream, password);
    }
}