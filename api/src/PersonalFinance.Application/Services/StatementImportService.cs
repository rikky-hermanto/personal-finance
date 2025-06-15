using PersonalFinance.Domain.Entities;
using PersonalFinance.Infrastructure.Parsers;

public class StatementImportService : IStatementImportService
{
    private readonly Dictionary<string, IBankStatementParser> _parsers;

    public StatementImportService(IEnumerable<IBankStatementParser> parsers)
    {
        // Map bank code to parser
        _parsers = new Dictionary<string, IBankStatementParser>(StringComparer.OrdinalIgnoreCase)
        {
            { "BCA", parsers.OfType<BcaCsvParser>().First() },
            // Add other banks here
        };
    }

    public async Task<List<Transaction>> ImportAsync(Stream stream, string bankCode)
    {
        if (!_parsers.TryGetValue(bankCode, out var parser))
            throw new NotSupportedException($"Bank '{bankCode}' is not supported.");

        return await parser.ParseAsync(stream);
    }
}