using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public class PortfolioReviewClient(HttpClient http, ILogger<PortfolioReviewClient> logger) : IPortfolioReviewClient
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<PortfolioReviewResponseDto> ReviewAsync(PortfolioReviewRequestDto req, CancellationToken ct = default)
    {
        logger.LogInformation("Sending portfolio review request to ai-service | setup={SetupName}", req.SetupName);

        using var resp = await http.PostAsJsonAsync("/portfolio-review", req, Json, ct);

        if ((int)resp.StatusCode == 502)
        {
            var body = await resp.Content.ReadAsStringAsync(ct);
            logger.LogError("ai-service portfolio-review 502: {Body}", body);
            throw new LlmExtractionException("AI review service temporarily unavailable.", isTransient: true);
        }

        resp.EnsureSuccessStatusCode();

        var result = await resp.Content.ReadFromJsonAsync<PortfolioReviewResponseDto>(Json, ct)
            ?? throw new LlmExtractionException("ai-service returned empty portfolio review response.");

        logger.LogInformation("Portfolio review completed for {SetupName}", req.SetupName);
        return result;
    }
}
