namespace PersonalFinance.Infrastructure.Parsers.Signatures;

public sealed class StandardCsvSignature : IBankSignature
{
    public string BankKey => BankKeys.Standard;

    public bool AppliesTo(string contentType) =>
        contentType.StartsWith("text/csv", StringComparison.OrdinalIgnoreCase);

    public bool Matches(BankProbeContext ctx) =>
        ctx.CsvTokenizedLines.Any(t =>
            t.Contains("DATE") &&
            (t.Contains("ITEM") || t.Contains("DESCRIPTION")) &&
            t.Contains("AMOUNT"));
}
