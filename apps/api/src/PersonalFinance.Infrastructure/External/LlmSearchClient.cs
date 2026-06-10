using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public sealed class LlmSearchClient : ILlmSearchClient
{
    private readonly HttpClient _http;
    private readonly ILogger<LlmSearchClient> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public LlmSearchClient(HttpClient http, ILogger<LlmSearchClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task EmbedTransactionsAsync(
        IReadOnlyList<EmbedItemRequest> items, CancellationToken ct = default)
    {
        var payload = new { items };
        var response = await _http.PostAsJsonAsync("/embed-transactions", payload, JsonOptions, ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Embed request failed | status={Status} | count={Count}",
                response.StatusCode, items.Count);
            // Fire-and-forget: do not throw — embedding failure must not break the upload.
        }
    }

    public async Task<SearchResponse> SearchAsync(
        string query, int topK = 5, CancellationToken ct = default)
    {
        var payload = new { query, top_k = topK };
        var response = await _http.PostAsJsonAsync("/search", payload, JsonOptions, ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SearchResponse>(JsonOptions, ct))!;
    }
}
