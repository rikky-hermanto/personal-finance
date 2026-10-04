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
        var result = await client.CategorizeAsync(
            "Netflix", "", "DB", 46500m, "SeaBank",
            new[] { "Food", "Bill", "Subscriptions" });

        // Assert: hallucinated category is discarded — returns safe fallback
        Assert.Equal("Uncategorized", result.Category);
        Assert.Equal(0.0, result.Confidence);
        Assert.False(result.RuleSeedAllowed);
    }

    [Fact]
    public async Task CategorizeAsync_HttpError_ReturnsFallbackWithoutThrowing()
    {
        // Arrange: AI service is unavailable
        var handler = new MockHttpMessageHandler(statusCode: HttpStatusCode.ServiceUnavailable);
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:8000") };
        var client = new LlmCategorizationClient(http, NullLogger<LlmCategorizationClient>.Instance);

        // Act — must not throw
        var result = await client.CategorizeAsync(
            "Netflix", "", "DB", 46500m, "SeaBank", new[] { "Bill" });

        // Assert
        Assert.Equal("Uncategorized", result.Category);
        Assert.Equal(0.0, result.Confidence);
        Assert.False(result.RuleSeedAllowed);
    }

    [Fact]
    public async Task CategorizeAsync_KnownCategory_ReturnsCategory()
    {
        // Arrange: LLM returns a valid known category
        var handler = new MockHttpMessageHandler(
            JsonSerializer.Serialize(new { category = "food", confidence = 0.95, rule_seed_allowed = true }));
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:8000") };
        var client = new LlmCategorizationClient(http, NullLogger<LlmCategorizationClient>.Instance);

        // Act
        var result = await client.CategorizeAsync(
            "Go Mie Go", "QRIS (PAYMENT)", "DB", 37500m, "NeoBank",
            new[] { "Food", "Bill" });

        // Assert
        Assert.Equal("Food", result.Category);
        Assert.Equal(0.95, result.Confidence, precision: 2);
        Assert.True(result.RuleSeedAllowed);
    }

    [Fact]
    public async Task CategorizeAsync_MissingRuleMetadata_DefaultsToFalse()
    {
        var handler = new MockHttpMessageHandler(
            JsonSerializer.Serialize(new { category = "Food", confidence = 0.95 }));
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:8000") };
        var client = new LlmCategorizationClient(http, NullLogger<LlmCategorizationClient>.Instance);

        var result = await client.CategorizeAsync(
            "Go Mie Go", "", "DB", 37500m, "NeoBank", new[] { "Food" });

        Assert.Equal("Food", result.Category);
        Assert.False(result.RuleSeedAllowed);
    }

    [Fact]
    public async Task CategorizeAsync_OutOfRangeConfidence_ReturnsFallback()
    {
        var handler = new MockHttpMessageHandler(
            JsonSerializer.Serialize(new { category = "Food", confidence = 1.1, rule_seed_allowed = true }));
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:8000") };
        var client = new LlmCategorizationClient(http, NullLogger<LlmCategorizationClient>.Instance);

        var result = await client.CategorizeAsync(
            "Go Mie Go", "", "DB", 37500m, "NeoBank", new[] { "Food" });

        Assert.Equal("Uncategorized", result.Category);
        Assert.Equal(0.0, result.Confidence);
        Assert.False(result.RuleSeedAllowed);
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
