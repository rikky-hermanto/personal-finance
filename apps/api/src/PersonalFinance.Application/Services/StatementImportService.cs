using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

public class StatementImportService : IStatementImportService
{
    private readonly IDictionary<string, IBankStatementParser> _parsers;

    public StatementImportService(IDictionary<string, IBankStatementParser> parsers)
    {
        _parsers = new Dictionary<string, IBankStatementParser>(parsers, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<List<TransactionDto>> ImportAsync(Stream stream, string bankCode, string? password = null)
    {
        if (!_parsers.TryGetValue(bankCode, out var parser))
            throw new NotSupportedException($"Bank '{bankCode}' is not supported.");

        return await parser.ParseAsync(stream, password);
    }
}