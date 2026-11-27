using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Infrastructure.External;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// The LlmExtractionClient paths Infrastructure/LlmExtractionClientTests does not reach: the form
/// fields sent, the transient-failure mapping, the image endpoint and the statement balance.
/// </summary>
public sealed class LlmExtractionClientContractTests
{
    private sealed class CapturingHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public string? Path { get; private set; }
        public string? RequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Path = request.RequestUri!.AbsolutePath;
            RequestBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }

    private static LlmExtractionClient Client(CapturingHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://ai-service:8000") }, NullLogger<LlmExtractionClient>.Instance);

    private static Stream Bytes() => new MemoryStream([0x25, 0x50, 0x44, 0x46]);

    private const string OneRow = """
        {"transactions":[{"date":"2025-04-02T12:30:00","description":"QRIS KOPI","remarks":"","flow":"DB","type":"Expense",
          "amount_idr":45500.5,"currency":"IDR","exchange_rate":null,"statement_balance":1204500.25,
          "account_name":"Jago","category":"Food"}],
         "total_parsed":1,"skipped_rows":0,"pages_processed":1}
        """;

    [Fact]
    public async Task ParsePdfAsync_HintAndPassword_AreSentAsFormFieldsWithThePdf()
    {
        // Arrange
        var handler = new CapturingHandler(HttpStatusCode.OK, OneRow);

        // Act
        await Client(handler).ParsePdfAsync(Bytes(), "superbank.pdf", "superbank", "s3cret");

        // Assert
        Assert.Equal("/parse-pdf", handler.Path);
        Assert.Contains("name=file; filename=superbank.pdf", handler.RequestBody);
        Assert.Contains("Content-Type: application/pdf", handler.RequestBody);
        Assert.Contains("name=bank_hint\r\n\r\nsuperbank", handler.RequestBody.Replace("Content-Type: text/plain; charset=utf-8\r\n", ""));
        Assert.Contains("name=password\r\n\r\ns3cret", handler.RequestBody.Replace("Content-Type: text/plain; charset=utf-8\r\n", ""));
    }

    [Fact]
    public async Task ParsePdfAsync_NoHintOrPassword_SendsOnlyTheFile()
    {
        // Arrange
        var handler = new CapturingHandler(HttpStatusCode.OK, OneRow);

        // Act
        await Client(handler).ParsePdfAsync(Bytes(), "statement.pdf", null, null);

        // Assert
        Assert.DoesNotContain("bank_hint", handler.RequestBody);
        Assert.DoesNotContain("password", handler.RequestBody);
    }

    [Fact]
    public async Task ParsePdfAsync_StatementBalance_MapsToStatementBalanceAndBalance()
    {
        // Arrange
        var handler = new CapturingHandler(HttpStatusCode.OK, OneRow);

        // Act
        var row = Assert.Single(await Client(handler).ParsePdfAsync(Bytes(), "jago.pdf", null, null));

        // Assert
        Assert.Equal(45_500.5m, row.AmountIdr);
        Assert.Equal(1_204_500.25m, row.StatementBalance);
        Assert.Equal(1_204_500.25m, row.Balance);
        Assert.Equal(new DateTime(2025, 4, 2, 12, 30, 0, DateTimeKind.Utc), row.Date); // no offset: read as UTC
        Assert.Equal(DateTimeKind.Utc, row.Date.Kind);
    }

    [Theory]
    [InlineData("provider_unavailable")]
    [InlineData("llm_rate_limited")]
    [InlineData("503 UNAVAILABLE")]
    [InlineData("The model is overloaded due to high demand")]
    public async Task ParsePdfAsync_ProviderBusy_ThrowsTransientWithFixedMessage(string detail)
    {
        // Arrange
        var handler = new CapturingHandler(HttpStatusCode.BadGateway, $$"""{"detail":"{{detail}}"}""");

        // Act
        var exception = await Assert.ThrowsAsync<LlmExtractionException>(() =>
            Client(handler).ParsePdfAsync(Bytes(), "statement.pdf", null, null));

        // Assert
        Assert.True(exception.IsTransient);
        Assert.Equal("The AI reading service is temporarily busy. Please wait a moment and try again.", exception.Message);
    }

    [Fact]
    public async Task ParsePdfAsync_ErrorBodyNotJson_ThrowsNonTransient()
    {
        // Arrange
        var handler = new CapturingHandler(HttpStatusCode.InternalServerError, "Internal Server Error");

        // Act
        var exception = await Assert.ThrowsAsync<LlmExtractionException>(() =>
            Client(handler).ParsePdfAsync(Bytes(), "statement.pdf", null, null));

        // Assert
        Assert.False(exception.IsTransient);
    }

    [Fact]
    public async Task ParsePdfAsync_NullBody_ThrowsEmptyResponse()
    {
        // Arrange
        var handler = new CapturingHandler(HttpStatusCode.OK, "null");

        // Act + Assert
        var exception = await Assert.ThrowsAsync<LlmExtractionException>(() =>
            Client(handler).ParsePdfAsync(Bytes(), "statement.pdf", null, null));
        Assert.Contains("empty response", exception.Message);
    }

    [Fact]
    public async Task ParseImageAsync_Screenshot_PostsImageWithItsTypeAndMapsRows()
    {
        // Arrange
        var handler = new CapturingHandler(HttpStatusCode.OK, """
            {"transactions":[{"date":"2025-04-02","description":"GOPAY TOPUP","flow":"DB","type":"Expense",
              "amount_idr":100000,"currency":"IDR","account_name":"Jago","category":"E-Wallet"}],
             "total_parsed":1,"skipped_rows":2}
            """);

        // Act
        var rows = await Client(handler).ParseImageAsync(new MemoryStream([0x89, 0x50]), "jago.png", "image/png", "jago");

        // Assert
        Assert.Equal("/parse-image", handler.Path);
        Assert.Contains("Content-Type: image/png", handler.RequestBody);
        Assert.Contains("name=bank_hint", handler.RequestBody);
        var row = Assert.Single(rows);
        Assert.Equal(100_000m, row.AmountIdr);
        Assert.Equal(("GOPAY TOPUP", "DB", "E-Wallet", "Jago"), (row.Description, row.Flow, row.Category, row.AccountName));
        Assert.Null(row.StatementBalance);
        Assert.Equal(0m, row.Balance);
    }

    [Fact]
    public async Task ParseImageAsync_NoHint_SendsOnlyTheImage()
    {
        // Arrange
        var handler = new CapturingHandler(HttpStatusCode.OK, """{"transactions":[],"total_parsed":0,"skipped_rows":0}""");

        // Act
        var rows = await Client(handler).ParseImageAsync(new MemoryStream([0xFF, 0xD8]), "x.jpg", "image/jpeg", null);

        // Assert
        Assert.Empty(rows);
        Assert.DoesNotContain("bank_hint", handler.RequestBody);
    }

    [Theory]
    [InlineData(HttpStatusCode.UnprocessableEntity)]
    [InlineData(HttpStatusCode.RequestEntityTooLarge)]
    public async Task ParseImageAsync_Rejected_ThrowsNotSupported(HttpStatusCode status)
    {
        // Arrange
        var handler = new CapturingHandler(status, """{"detail":"file_too_large"}""");

        // Act + Assert
        await Assert.ThrowsAsync<NotSupportedException>(() =>
            Client(handler).ParseImageAsync(new MemoryStream([0x89]), "big.png", "image/png", null));
    }

    [Fact]
    public async Task ParseImageAsync_ServerError_ThrowsLlmExtractionException()
    {
        // Arrange
        var handler = new CapturingHandler(HttpStatusCode.BadGateway, """{"detail":"llm_parse_error"}""");

        // Act
        var exception = await Assert.ThrowsAsync<LlmExtractionException>(() =>
            Client(handler).ParseImageAsync(new MemoryStream([0x89]), "x.png", "image/png", null));

        // Assert
        Assert.False(exception.IsTransient);
    }

    [Fact]
    public async Task ParseImageAsync_NullBody_ThrowsEmptyResponse()
    {
        // Arrange
        var handler = new CapturingHandler(HttpStatusCode.OK, "null");

        // Act + Assert
        await Assert.ThrowsAsync<LlmExtractionException>(() =>
            Client(handler).ParseImageAsync(new MemoryStream([0x89]), "x.png", "image/png", null));
    }
}
