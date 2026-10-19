using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

/// <summary>
/// Owner-scoped chat calls to the AI service (PF-S15). Implementations act for the
/// current verified caller only; the owner is never taken from the request body.
/// </summary>
public interface IAiChatClient
{
    /// <summary>Streams the SSE answer for <paramref name="request"/> into <paramref name="destination"/>.</summary>
    Task StreamAskAsync(AskChatRequest request, Stream destination, CancellationToken ct);

    /// <summary>Suggested follow-up questions. Decorative: failures return an empty list.</summary>
    Task<IReadOnlyList<string>> FollowUpsAsync(FollowUpChatRequest request, CancellationToken ct);

    /// <summary>
    /// One advisor turn. The advisor's tools read data back through this API with the
    /// caller's own bearer token, and its memory is keyed by caller plus session.
    /// </summary>
    Task<AdvisorChatResponse> AdvisorAsync(AdvisorChatRequest request, CancellationToken ct);
}
