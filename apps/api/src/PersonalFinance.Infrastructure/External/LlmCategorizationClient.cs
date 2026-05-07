using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
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

    public async Task<(string Category, double Confidence)> CategorizeAsync(
        string description, string remarks, string flow, decimal amountIdr, string wallet,
        IReadOnlyList<string> availableCategories,
        CancellationToken ct = default)
    {
        try
        {
            var request = new CategorizeRequest(
                description, remarks, flow, (double)amountIdr, wallet,
                availableCategories.ToList());

            var response = await _http.PostAsJsonAsync("/categorize", request, JsonOptions, ct);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(ct);
                _logger.LogWarning("LLM categorize returned {Status}: {Body}", (int)response.StatusCode, body);
                return ("Untracked Expense", 0.0);
            }

            var result = await response.Content.ReadFromJsonAsync<CategorizeResponse>(JsonOptions, ct);
            if (result is null || !availableCategories.Contains(result.Category, StringComparer.OrdinalIgnoreCase))
            {
                _logger.LogWarning("LLM returned unknown category '{Cat}' — discarding.", result?.Category);
                return ("Untracked Expense", 0.0);
            }

            _logger.LogInformation("Layer 3 LLM: '{Desc}' → '{Cat}' (confidence={Conf:P0})",
                description, result.Category, result.Confidence);
            return (result.Category, result.Confidence);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "LLM categorize call failed — falling back to Untracked Expense.");
            return ("Untracked Expense", 0.0);
        }
    }

    private sealed record CategorizeRequest(
        string Description,
        string Remarks,
        string Flow,
        double AmountIdr,
        string Wallet,
        List<string> AvailableCategories);

    private sealed class CategorizeResponse
    {
        public string Category    { get; set; } = "Untracked Expense";
        public double Confidence  { get; set; } = 0.0;
    }
}
