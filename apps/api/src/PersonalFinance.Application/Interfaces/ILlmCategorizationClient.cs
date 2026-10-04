using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface ILlmCategorizationClient
{
    /// <summary>
    /// Asks the LLM to classify a single transaction into one of the supplied categories.
    /// Returns a bounded category decision and explicit rule-seeding eligibility.
    /// Returns Uncategorized/0/false when the service is unavailable or returns
    /// invalid data or a category not in the supplied list.
    /// Never throws — all errors are swallowed and logged.
    /// </summary>
    Task<LlmCategorizationResult> CategorizeAsync(
        string description,
        string remarks,
        string flow,
        decimal amountIdr,
        string accountName,
        IReadOnlyList<string> availableCategories,
        CancellationToken ct = default);
}
