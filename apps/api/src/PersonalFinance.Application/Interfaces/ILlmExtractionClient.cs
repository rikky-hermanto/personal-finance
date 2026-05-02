using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface ILlmExtractionClient
{
    Task<List<TransactionDto>> ParsePdfAsync(
        Stream pdf, string fileName, string? bankHint, string? password,
        CancellationToken ct = default);

    Task<List<TransactionDto>> ParseImageAsync(
        Stream image, string fileName, string contentType, string? bankHint,
        CancellationToken ct = default);
}
