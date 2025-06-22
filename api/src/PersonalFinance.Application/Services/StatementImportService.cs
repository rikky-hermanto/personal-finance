using PersonalFinance.Domain.Entities;
using PersonalFinance.Application.Dtos;

public class StatementImportService : IStatementImportService
{
    private readonly Dictionary<string, IBankStatementParser> _parsers;

    public StatementImportService(IEnumerable<IBankStatementParser> parsers)
    {
        _parsers = new Dictionary<string, IBankStatementParser>(StringComparer.OrdinalIgnoreCase)
        {
            { "BCA", parsers.OfType<BcaCsvParser>().First() },
            { "NEOBANK", parsers.OfType<NeoBankPdfParser>().First() },
        };
    }

    public async Task<List<TransactionDto>> ImportAsync(Stream stream, string bankCode, string? password = null)
    {
        if (!_parsers.TryGetValue(bankCode, out var parser))
            throw new NotSupportedException($"Bank '{bankCode}' is not supported.");

        return await parser.ParseAsync(stream, password);
    }
}