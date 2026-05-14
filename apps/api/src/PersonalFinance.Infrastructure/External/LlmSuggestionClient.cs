using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public class LlmSuggestionClient(HttpClient http, ILogger<LlmSuggestionClient> logger)
    : ILlmSuggestionClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<List<MerchantSuggestion>> SuggestBatchAsync(
        List<string> merchantPatterns,
        List<string> availableCategories,
        CancellationToken ct = default)
    {
        var request = new SuggestRequest(merchantPatterns, availableCategories);
        var response = await http.PostAsJsonAsync("/suggest-categories", request, JsonOptions, ct);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("LLM suggest-categories failed: {Status}", response.StatusCode);
            return [];
        }

        var result = await response.Content.ReadFromJsonAsync<SuggestResponse>(JsonOptions, ct);
        return result?.Suggestions
            .Select(s => new MerchantSuggestion(s.MerchantPattern, s.SuggestedCategory, s.SuggestedKeyword, s.Confidence))
            .ToList() ?? [];
    }

    private record SuggestRequest(List<string> MerchantPatterns, List<string> AvailableCategories);
    private record SuggestResponse(List<SuggestionItem> Suggestions);
    private record SuggestionItem(string MerchantPattern, string SuggestedCategory, string SuggestedKeyword, double Confidence);
}
