namespace PersonalFinance.Application.Interfaces;

public record MerchantSuggestion(
    string MerchantPattern,
    string SuggestedCategory,
    string SuggestedKeyword,
    double Confidence);

public interface ILlmSuggestionClient
{
    Task<List<MerchantSuggestion>> SuggestBatchAsync(
        List<string> merchantPatterns,
        List<string> availableCategories,
        CancellationToken ct = default);
}
