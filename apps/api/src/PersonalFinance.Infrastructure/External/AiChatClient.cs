using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

/// <summary>
/// Proxies chat to the AI service for the verified caller (PF-S15). The internal key is
/// a default header from Program.cs; the owner token is signed per request here.
/// </summary>
public sealed class AiChatClient(
    HttpClient http, ICurrentUser caller, OwnerTokenSigner signer, ILogger<AiChatClient> logger)
    : IAiChatClient
{
    public const string UserTokenHeader = "X-Pf-User-Token";

    private static readonly JsonSerializerOptions Json = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task StreamAskAsync(AskChatRequest request, Stream destination, CancellationToken ct)
    {
        using var message = OwnerRequest("/ask/stream", request);
        using var response = await http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, ct);
        await EnsureSuccessAsync(response, "/ask/stream", ct);

        // Copy with a flush per read so tokens reach the browser as they arrive.
        await using var upstream = await response.Content.ReadAsStreamAsync(ct);
        var buffer = new byte[4096];
        int read;
        while ((read = await upstream.ReadAsync(buffer, ct)) > 0)
        {
            await destination.WriteAsync(buffer.AsMemory(0, read), ct);
            await destination.FlushAsync(ct);
        }
    }

    public async Task<IReadOnlyList<string>> FollowUpsAsync(FollowUpChatRequest request, CancellationToken ct)
    {
        try
        {
            using var message = OwnerRequest("/ask/followups", request);
            using var response = await http.SendAsync(message, ct);
            await EnsureSuccessAsync(response, "/ask/followups", ct);
            var body = await response.Content.ReadFromJsonAsync<FollowUpsResponse>(Json, ct);
            return body?.Questions ?? [];
        }
        catch (Exception ex) when (ex is AiChatUnavailableException or HttpRequestException or JsonException)
        {
            // Suggestions are decorative; the browser falls back to its static chips.
            return [];
        }
    }

    public async Task<AdvisorChatResponse> AdvisorAsync(AdvisorChatRequest request, CancellationToken ct)
    {
        using var message = OwnerRequest("/advisor", request);
        // The advisor's tools call this API back as the caller, so ownership checks stay here.
        message.Headers.Add(UserTokenHeader, caller.AccessToken);
        using var response = await http.SendAsync(message, ct);
        await EnsureSuccessAsync(response, "/advisor", ct);
        try
        {
            return await response.Content.ReadFromJsonAsync<AdvisorChatResponse>(Json, ct)
                ?? throw new AiChatUnavailableException();
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "ai-service /advisor returned an unreadable body");
            throw new AiChatUnavailableException();
        }
    }

    private HttpRequestMessage OwnerRequest<T>(string path, T payload)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(payload, options: Json),
        };
        message.Headers.Add(OwnerTokenSigner.HeaderName, signer.Sign(caller.UserId));
        return message;
    }

    private async Task EnsureSuccessAsync(HttpResponseMessage response, string path, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        var body = await response.Content.ReadAsStringAsync(ct);
        logger.LogError("ai-service {Path} returned {Status}: {Body}", path, (int)response.StatusCode, body);
        throw new AiChatUnavailableException();
    }

    private sealed record FollowUpsResponse([property: JsonPropertyName("questions")] IReadOnlyList<string>? Questions);
}
