namespace PersonalFinance.Infrastructure.Parsers.Signatures;

public sealed class BcaCsvSignature : IBankSignature
{
    public string BankKey => BankKeys.Bca;

    public bool AppliesTo(string contentType) =>
        contentType.StartsWith("text/csv", StringComparison.OrdinalIgnoreCase);

    // CABANG (branch column) is BCA-specific — no other supported bank puts it in their CSV header.
    // Relying on the column header alone (not the preamble) makes detection resilient to
    // stripped metadata lines (e.g. user saved through Excel and lost the No. Rekening rows).
    public bool Matches(BankProbeContext ctx) =>
        ctx.CsvTokenizedLines.Any(t =>
            t.Contains("TANGGAL") &&
            t.Contains("KETERANGAN") &&
            t.Contains("CABANG") &&
            t.Contains("SALDO"));
}
