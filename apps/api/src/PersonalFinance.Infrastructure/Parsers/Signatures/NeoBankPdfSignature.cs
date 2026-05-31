namespace PersonalFinance.Infrastructure.Parsers.Signatures;

public sealed class NeoBankPdfSignature : IBankSignature
{
    public string BankKey => BankKeys.NeoBank;

    public bool AppliesTo(string contentType) =>
        contentType.StartsWith("application/pdf", StringComparison.OrdinalIgnoreCase);

    public bool Matches(BankProbeContext ctx) =>
        ctx.PdfFirstPageText.Contains("NOW Savings", StringComparison.OrdinalIgnoreCase);
}
