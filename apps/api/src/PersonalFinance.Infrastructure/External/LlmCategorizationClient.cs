using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public class LlmCategorizationClient : ILlmCategorizationClient
{
    private readonly HttpClient _http;
    private readonly ILogger<LlmCategorizationClient> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public LlmCategorizationClient(HttpClient http, ILogger<LlmCategorizationClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<LlmCategorizationResult> CategorizeAsync(
        string description, string remarks, string flow, decimal amountIdr, string accountName,
        IReadOnlyList<string> availableCategories,
        CancellationToken ct = default)
    {
        try
        {
            var request = new CategorizeRequest(
                description, remarks, flow, (double)amountIdr, accountName,
                availableCategories.ToList());

            var response = await _http.PostAsJsonAsync("/categorize", request, JsonOptions, ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Categorization service returned HTTP {Status}; preserving Uncategorized.",
                    (int)response.StatusCode);
                return new LlmCategorizationResult("Uncategorized", 0.0, false);
            }

            var result = await response.Content.ReadFromJsonAsync<CategorizeResponse>(JsonOptions, ct);
            var canonicalCategory = result is null
                ? null
                : availableCategories.FirstOrDefault(category =>
                    category.Equals(result.Category, StringComparison.OrdinalIgnoreCase));

            if (result is null || canonicalCategory is null ||
                !double.IsFinite(result.Confidence) || result.Confidence is < 0.0 or > 1.0)
            {
                _logger.LogWarning("Categorization service returned an invalid bounded decision; preserving Uncategorized.");
                return new LlmCategorizationResult("Uncategorized", 0.0, false);
            }

            var decision = new LlmCategorizationResult(
                canonicalCategory,
                result.Confidence,
                result.RuleSeedAllowed is true);
            _logger.LogInformation(
                "Layer 3 categorization accepted category={Category} confidence={Confidence:P0} rule_seed_allowed={RuleSeedAllowed}",
                decision.Category, decision.Confidence, decision.RuleSeedAllowed);
            return decision;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Categorization service call failed; preserving Uncategorized.");
            return new LlmCategorizationResult("Uncategorized", 0.0, false);
        }
    }

    private sealed record CategorizeRequest(
        string Description,
        string Remarks,
        string Flow,
        double AmountIdr,
        string AccountName,
        List<string> AvailableCategories);

    private sealed class CategorizeResponse
    {
        public string Category    { get; set; } = "Uncategorized";
        public double Confidence  { get; set; } = 0.0;
        public bool? RuleSeedAllowed { get; set; }
    }
}
