using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Infrastructure.External;

namespace PersonalFinance.Tests.Services;

public class LlmCategorizationClientTests
{
    [Fact]
    public async Task CategorizeAsync_LlmReturnsUnknownCategory_ReturnsFallback()
    {
        // Arrange: LLM returns a hallucinated category not in availableCategories
        var handler = new MockHttpMessageHandler(
            JsonSerializer.Serialize(new { category = "Hallucinated Category", confidence = 0.97 }));
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:8000") };
        var client = new LlmCategorizationClient(http, NullLogger<LlmCategorizationClient>.Instance);

        // Act
        var (category, confidence) = await client.CategorizeAsync(
            "Netflix", "", "DB", 46500m, "SeaBank",
            new[] { "Food", "Bill", "Subscriptions" });

        // Assert: hallucinated category is discarded — returns safe fallback
        Assert.Equal("Uncategorized", category);
        Assert.Equal(0.0, confidence);
    }

    [Fact]
    public async Task CategorizeAsync_HttpError_ReturnsFallbackWithoutThrowing()
    {
        // Arrange: AI service is unavailable
        var handler = new MockHttpMessageHandler(statusCode: HttpStatusCode.ServiceUnavailable);
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:8000") };
        var client = new LlmCategorizationClient(http, NullLogger<LlmCategorizationClient>.Instance);

        // Act — must not throw
        var (category, confidence) = await client.CategorizeAsync(
            "Netflix", "", "DB", 46500m, "SeaBank", new[] { "Bill" });

        // Assert
        Assert.Equal("Uncategorized", category);
        Assert.Equal(0.0, confidence);
    }

    [Fact]
    public async Task CategorizeAsync_KnownCategory_ReturnsCategory()
    {
        // Arrange: LLM returns a valid known category
        var handler = new MockHttpMessageHandler(
            JsonSerializer.Serialize(new { category = "Food", confidence = 0.95 }));
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:8000") };
        var client = new LlmCategorizationClient(http, NullLogger<LlmCategorizationClient>.Instance);

        // Act
        var (category, confidence) = await client.CategorizeAsync(
            "Go Mie Go", "QRIS (PAYMENT)", "DB", 37500m, "NeoBank",
            new[] { "Food", "Bill" });

        // Assert
        Assert.Equal("Food", category);
        Assert.Equal(0.95, confidence, precision: 2);
    }

    private sealed class MockHttpMessageHandler : HttpMessageHandler
    {
        private readonly string _json;
        private readonly HttpStatusCode _statusCode;

        public MockHttpMessageHandler(string json = "", HttpStatusCode statusCode = HttpStatusCode.OK)
        {
            _json       = json;
            _statusCode = statusCode;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(_statusCode)
            {
                Content = new StringContent(_json, Encoding.UTF8, "application/json"),
            });
    }
}
