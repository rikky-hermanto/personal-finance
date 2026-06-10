namespace PersonalFinance.Application.Interfaces;

public interface ILlmSearchClient
{
    Task EmbedTransactionsAsync(IReadOnlyList<EmbedItemRequest> items, CancellationToken ct = default);
    Task<SearchResponse> SearchAsync(string query, int topK = 5, CancellationToken ct = default);
}

public sealed record EmbedItemRequest(
    int TransactionId, string Description,
    string Remarks = "", string Category = "", string Wallet = "");

public sealed record SearchResultDto(
    int TransactionId, double Similarity,
    string Description, string Date, decimal AmountIdr, string Flow, string Wallet);

public sealed record SearchResponse(IReadOnlyList<SearchResultDto> Results, string Query, int TotalFound);
