namespace PersonalFinance.Infrastructure.Parsers;

/// <summary>
/// Pre-read snapshot of a file stream, built once before the signature chain runs.
/// Eliminates repeated stream seeks and repeated PDF/CSV parsing in BankIdentifier.
/// </summary>
public sealed record BankProbeContext(
    IReadOnlyList<HashSet<string>> CsvTokenizedLines,
    string PdfFirstPageText,
    bool IsPdf
);
