using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Moq.Protected;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Infrastructure.External;

namespace PersonalFinance.Tests.Services;

public class LlmSuggestionClientTests
{
    private static LlmSuggestionClient BuildClient(HttpResponseMessage response)
    {
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(response);

        var http = new HttpClient(handler.Object) { BaseAddress = new Uri("http://localhost:8000") };
        return new LlmSuggestionClient(http, NullLogger<LlmSuggestionClient>.Instance);
    }

    [Fact]
    public async Task SuggestBatchAsync_SuccessResponse_ReturnsMappedSuggestions()
    {
        // Arrange
        var payload = JsonSerializer.Serialize(new
        {
            suggestions = new[]
            {
                new { merchant_pattern = "GOPAY/TOPUP", suggested_category = "E-Wallet", suggested_keyword = "GOPAY", confidence = 0.95 },
                new { merchant_pattern = "AZKO BALI",   suggested_category = "Food & Dining", suggested_keyword = "AZKO", confidence = 0.88 },
            }
        });
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(payload, System.Text.Encoding.UTF8, "application/json")
        };
        var svc = BuildClient(response);

        // Act
        var result = await svc.SuggestBatchAsync(["GOPAY/TOPUP", "AZKO BALI"], ["E-Wallet", "Food & Dining"]);

        // Assert
        Assert.Equal(2, result.Count);
        Assert.Equal("GOPAY",     result[0].SuggestedKeyword);
        Assert.Equal("E-Wallet",  result[0].SuggestedCategory);
        Assert.Equal(0.95,        result[0].Confidence);
        Assert.Equal("AZKO",      result[1].SuggestedKeyword);
    }

    [Fact]
    public async Task SuggestBatchAsync_NonSuccessResponse_ReturnsEmptyList()
    {
        // Arrange
        var svc = BuildClient(new HttpResponseMessage(HttpStatusCode.InternalServerError));

        // Act
        var result = await svc.SuggestBatchAsync(["UNKNOWN MERCHANT"], ["Food"]);

        // Assert: graceful fallback — empty list, no exception
        Assert.Empty(result);
    }

    [Fact]
    public async Task SuggestBatchAsync_ServiceUnavailable_ReturnsEmptyList()
    {
        // Arrange
        var svc = BuildClient(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));

        // Act
        var result = await svc.SuggestBatchAsync(["ANY PATTERN"], ["Expense"]);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public async Task SuggestBatchAsync_VerifiesRequestShape()
    {
        // Arrange: capture the outgoing request to verify snake_case serialization
        HttpRequestMessage? captured = null;
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => captured = req)
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"suggestions":[]}""", System.Text.Encoding.UTF8, "application/json")
            });

        var http = new HttpClient(handler.Object) { BaseAddress = new Uri("http://localhost:8000") };
        var svc = new LlmSuggestionClient(http, NullLogger<LlmSuggestionClient>.Instance);

        // Act
        await svc.SuggestBatchAsync(["GOPAY"], ["E-Wallet"]);

        // Assert: request body uses snake_case keys
        Assert.NotNull(captured);
        var body = await captured!.Content!.ReadAsStringAsync();
        Assert.Contains("merchant_patterns", body);
        Assert.Contains("available_categories", body);
        Assert.Contains("GOPAY", body);
    }
}
