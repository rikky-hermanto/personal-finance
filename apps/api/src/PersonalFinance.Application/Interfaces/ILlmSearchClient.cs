namespace PersonalFinance.Application.Interfaces;

/// <summary>
/// Owner-scoped search and embedding calls to the AI service (PF-S15). The owner is
/// passed explicitly because background embedding runs after the request scope (and
/// so ICurrentUser) is gone.
/// </summary>
public interface ILlmSearchClient
{
    Task EmbedTransactionsAsync(IReadOnlyList<EmbedItemRequest> items, Guid ownerId, CancellationToken ct = default);
    Task<SearchResponse> SearchAsync(string query, Guid ownerId, int topK = 5, CancellationToken ct = default);
}

public sealed record EmbedItemRequest(
    int TransactionId, string Description,
    string Remarks = "", string Category = "", string Wallet = "");

public sealed record SearchResultDto(
    int TransactionId, double Similarity,
    string Description, string Date, decimal AmountIdr, string Flow, string Wallet);

public sealed record SearchResponse(IReadOnlyList<SearchResultDto> Results, string Query, int TotalFound);
