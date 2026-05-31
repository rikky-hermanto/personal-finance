namespace PersonalFinance.Infrastructure.Parsers.Signatures;

public sealed class SuperbankPdfSignature : IBankSignature
{
    public string BankKey => BankKeys.Superbank;

    public bool AppliesTo(string contentType) =>
        contentType.StartsWith("application/pdf", StringComparison.OrdinalIgnoreCase);

    public bool Matches(BankProbeContext ctx) =>
        ctx.PdfFirstPageText.Contains("Superbank", StringComparison.OrdinalIgnoreCase);
}
