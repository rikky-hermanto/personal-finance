namespace PersonalFinance.Application.Interfaces;

public interface ILlmCategorizationClient
{
    /// <summary>
    /// Asks the LLM to classify a single transaction into one of the supplied categories.
    /// Returns (category, confidence) where confidence is 0.0–1.0.
    /// Returns ("Untracked Expense", 0.0) when the LLM is unavailable or returns
    /// a category not in the supplied list.
    /// Never throws — all errors are swallowed and logged.
    /// </summary>
    Task<(string Category, double Confidence)> CategorizeAsync(
        string description,
        string remarks,
        string flow,
        decimal amountIdr,
        string wallet,
        IReadOnlyList<string> availableCategories,
        CancellationToken ct = default);
}
