using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Infrastructure.External;

namespace PersonalFinance.Tests.Infrastructure;

public class LlmExtractionClientTests
{
    private static LlmExtractionClient BuildClient(HttpMessageHandler handler)
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://ai-service:8000") };
        return new LlmExtractionClient(http, NullLogger<LlmExtractionClient>.Instance);
    }

    private static string MakePdfParseResponse(object[]? transactions = null) =>
        JsonSerializer.Serialize(new
        {
            transactions = transactions ?? [],
            total_parsed = transactions?.Length ?? 0,
            skipped_rows = 0,
            pages_processed = 1,
        });

    // ── Happy path ───────────────────────────────────────────────────────────

    [Fact]
    public async Task ParsePdfAsync_ValidResponse_ReturnsMappedTransactionDtos()
    {
        var json = MakePdfParseResponse(
        [
            new
            {
                date = "2025-01-15",
                description = "TRANSFER TO ABC",
                remarks = "",
                flow = "DB",
                type = "Expense",
                amount_idr = 150000.0,
                currency = "IDR",
                exchange_rate = (double?)null,
                wallet = "Superbank",
                category = "Transfer",
            }
        ]);

        var handler = new FakeHttpHandler(HttpStatusCode.OK, json);
        var client = BuildClient(handler);

        var result = await client.ParsePdfAsync(new MemoryStream([0x25, 0x50, 0x44, 0x46]), "test.pdf", null, null);

        Assert.Single(result);
        var tx = result[0];
        Assert.Equal(new DateTime(2025, 1, 15, 0, 0, 0, DateTimeKind.Utc), tx.Date);
        Assert.Equal("TRANSFER TO ABC", tx.Description);
        Assert.Equal("DB", tx.Flow);
        Assert.Equal("Expense", tx.Type);
        Assert.Equal(150000m, tx.AmountIdr);
        Assert.Equal("IDR", tx.Currency);
        Assert.Null(tx.ExchangeRate);
        Assert.Equal("Superbank", tx.Wallet);
        Assert.Equal("Transfer", tx.Category);
    }

    [Fact]
    public async Task ParsePdfAsync_AmountIdr_MappedCorrectlyAsDecimal()
    {
        var json = MakePdfParseResponse(
        [
            new
            {
                date = "2025-03-01",
                description = "SALARY",
                remarks = "",
                flow = "CR",
                type = "Income",
                amount_idr = 5000000.50,
                currency = "IDR",
                exchange_rate = (double?)null,
                wallet = "",
                category = "Untracked Expense",
            }
        ]);

        var handler = new FakeHttpHandler(HttpStatusCode.OK, json);
        var client = BuildClient(handler);

        var result = await client.ParsePdfAsync(new MemoryStream([0x25]), "test.pdf", null, null);

        Assert.Equal(5000000.50m, result[0].AmountIdr);
    }

    [Fact]
    public async Task ParsePdfAsync_WithExchangeRate_MapsFxRate()
    {
        var json = MakePdfParseResponse(
        [
            new
            {
                date = "2025-04-10",
                description = "WISE TRANSFER",
                remarks = "",
                flow = "DB",
                type = "Expense",
                amount_idr = 3200000.0,
                currency = "USD",
                exchange_rate = (double?)16000.0,
                wallet = "Wise",
                category = "Untracked Expense",
            }
        ]);

        var handler = new FakeHttpHandler(HttpStatusCode.OK, json);
        var client = BuildClient(handler);

        var result = await client.ParsePdfAsync(new MemoryStream([0x25]), "test.pdf", null, null);

        Assert.Equal(16000m, result[0].ExchangeRate);
        Assert.Equal("USD", result[0].Currency);
    }

    // ── Error paths ──────────────────────────────────────────────────────────

    [Fact]
    public async Task ParsePdfAsync_Http422_ThrowsNotSupportedException()
    {
        var handler = new FakeHttpHandler(HttpStatusCode.UnprocessableEntity,
            "{\"detail\":\"Expected application/pdf\"}");
        var client = BuildClient(handler);

        await Assert.ThrowsAsync<NotSupportedException>(
            () => client.ParsePdfAsync(new MemoryStream([0x25]), "bad.pdf", null, null));
    }

    [Fact]
    public async Task ParsePdfAsync_Http502_ThrowsLlmExtractionException()
    {
        var handler = new FakeHttpHandler(HttpStatusCode.BadGateway,
            "{\"detail\":\"Response truncated — statement too long\"}");
        var client = BuildClient(handler);

        var ex = await Assert.ThrowsAsync<LlmExtractionException>(
            () => client.ParsePdfAsync(new MemoryStream([0x25]), "test.pdf", null, null));

        Assert.Contains("Response truncated", ex.Message);
    }

    [Fact]
    public async Task ParsePdfAsync_Http500_ThrowsLlmExtractionException()
    {
        var handler = new FakeHttpHandler(HttpStatusCode.InternalServerError, "{\"detail\":\"internal_error\"}");
        var client = BuildClient(handler);

        await Assert.ThrowsAsync<LlmExtractionException>(
            () => client.ParsePdfAsync(new MemoryStream([0x25]), "test.pdf", null, null));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private sealed class FakeHttpHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _status;
        private readonly string _body;

        public FakeHttpHandler(HttpStatusCode status, string body)
        {
            _status = status;
            _body = body;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(_status)
            {
                Content = new StringContent(_body, Encoding.UTF8, "application/json"),
            });
    }
}
