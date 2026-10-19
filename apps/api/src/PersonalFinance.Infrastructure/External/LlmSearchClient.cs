using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public sealed class LlmSearchClient : ILlmSearchClient
{
    private readonly HttpClient _http;
    private readonly OwnerTokenSigner _signer;
    private readonly ILogger<LlmSearchClient> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public LlmSearchClient(HttpClient http, OwnerTokenSigner signer, ILogger<LlmSearchClient> logger)
    {
        _http = http;
        _signer = signer;
        _logger = logger;
    }

    public async Task EmbedTransactionsAsync(
        IReadOnlyList<EmbedItemRequest> items, Guid ownerId, CancellationToken ct = default)
    {
        using var message = OwnerRequest("/embed-transactions", new { items }, ownerId);
        using var response = await _http.SendAsync(message, ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Embed request failed | status={Status} | count={Count}",
                response.StatusCode, items.Count);
            // Fire-and-forget: do not throw — embedding failure must not break the upload.
        }
    }

    public async Task<SearchResponse> SearchAsync(
        string query, Guid ownerId, int topK = 5, CancellationToken ct = default)
    {
        using var message = OwnerRequest("/search", new { query, top_k = topK }, ownerId);
        using var response = await _http.SendAsync(message, ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SearchResponse>(JsonOptions, ct))!;
    }

    private HttpRequestMessage OwnerRequest<T>(string path, T payload, Guid ownerId)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(payload, options: JsonOptions),
        };
        message.Headers.Add(OwnerTokenSigner.HeaderName, _signer.Sign(ownerId));
        return message;
    }
}
