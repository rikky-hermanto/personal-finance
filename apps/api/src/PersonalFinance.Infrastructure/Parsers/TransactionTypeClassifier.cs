namespace PersonalFinance.Infrastructure.Parsers;

/// <summary>
/// Classifies transaction type from description signals before falling back to flow direction.
/// Type is a semantic property — flow alone cannot distinguish "Income" from "Asset Transfer".
/// </summary>
public static class TransactionTypeClassifier
{
    // Bank-channel signals that unambiguously indicate money moving between accounts,
    // regardless of whether it shows as CR or DB on the receiving statement.
    // Intentionally excludes plain "transfer" — too broad, matches "Transfer/Admin Fee" etc.
    private static readonly string[] AssetTransferSignals =
    [
        "bi-fast", "bifast",
        "transfer masuk", "transfer keluar",
        "transfer in", "transfer out",
        "incoming transfer", "outgoing transfer",
        "kliring", "rtgs", "sknbi", "inkaso",
    ];

    /// <summary>
    /// Returns "Asset Transfer", "Income", or "Expense" for the given description + flow.
    /// Asset Transfer signals in the description take priority over flow-derived types.
    /// </summary>
    public static string Classify(string description, string flow)
    {
        var norm = Squash(description);
        foreach (var signal in AssetTransferSignals)
            if (norm.Contains(signal, StringComparison.Ordinal)) // Ordinal safe — both already lowercased
                return "Asset Transfer";

        return flow.Equals("CR", StringComparison.OrdinalIgnoreCase) ? "Income" : "Expense";
    }

    /// <summary>
    /// Collapses any whitespace run to a single ASCII space and lowercases.
    /// Use this on both sides of any string comparison to be tolerant of format drift.
    /// </summary>
    public static string Squash(string? input) =>
        string.IsNullOrWhiteSpace(input)
            ? string.Empty
            : string.Join(' ', input.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
                    .ToLowerInvariant();
}
