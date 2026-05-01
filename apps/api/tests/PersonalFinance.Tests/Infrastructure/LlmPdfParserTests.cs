using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Tests.Infrastructure;

public class LlmPdfParserTests
{
    private static List<TransactionDto> SampleTransactions() =>
    [
        new() { Description = "TX1", AmountIdr = 100000m, Flow = "DB", Wallet = "Superbank" },
        new() { Description = "TX2", AmountIdr = 200000m, Flow = "CR", Wallet = "Superbank" },
    ];

    [Fact]
    public async Task ParseAsync_ValidResponse_CallsCategorizeBatchAsyncOnce()
    {
        var transactions = SampleTransactions();
        var mockClient = new Mock<ILlmExtractionClient>();
        mockClient
            .Setup(c => c.ParsePdfAsync(It.IsAny<Stream>(), It.IsAny<string>(), null, null, default))
            .ReturnsAsync(transactions);

        var mockCategory = new Mock<ICategoryRuleService>();
        mockCategory
            .Setup(s => s.CategorizeBatchAsync(It.IsAny<List<TransactionDto>>()))
            .ReturnsAsync(transactions);

        var parser = new LlmPdfParser(mockClient.Object, mockCategory.Object, NullLogger<LlmPdfParser>.Instance);

        var result = await parser.ParseAsync(new MemoryStream([0x25]), password: null);

        Assert.Equal(2, result.Count);
        mockCategory.Verify(s => s.CategorizeBatchAsync(transactions), Times.Once);
    }

    [Fact]
    public async Task ParseAsync_ClientThrows_PropagatesException()
    {
        var mockClient = new Mock<ILlmExtractionClient>();
        mockClient
            .Setup(c => c.ParsePdfAsync(It.IsAny<Stream>(), It.IsAny<string>(), null, null, default))
            .ThrowsAsync(new PersonalFinance.Infrastructure.External.LlmExtractionException("AI service error"));

        var mockCategory = new Mock<ICategoryRuleService>();
        var parser = new LlmPdfParser(mockClient.Object, mockCategory.Object, NullLogger<LlmPdfParser>.Instance);

        await Assert.ThrowsAsync<PersonalFinance.Infrastructure.External.LlmExtractionException>(
            () => parser.ParseAsync(new MemoryStream([0x25])));

        mockCategory.Verify(s => s.CategorizeBatchAsync(It.IsAny<List<TransactionDto>>()), Times.Never);
    }

    [Fact]
    public async Task ParseAsync_PassesPasswordToClient()
    {
        var mockClient = new Mock<ILlmExtractionClient>();
        mockClient
            .Setup(c => c.ParsePdfAsync(It.IsAny<Stream>(), It.IsAny<string>(), null, "secret", default))
            .ReturnsAsync([]);

        var mockCategory = new Mock<ICategoryRuleService>();
        mockCategory.Setup(s => s.CategorizeBatchAsync(It.IsAny<List<TransactionDto>>())).ReturnsAsync(new List<TransactionDto>());

        var parser = new LlmPdfParser(mockClient.Object, mockCategory.Object, NullLogger<LlmPdfParser>.Instance);

        await parser.ParseAsync(new MemoryStream([0x25]), password: "secret");

        mockClient.Verify(
            c => c.ParsePdfAsync(It.IsAny<Stream>(), It.IsAny<string>(), null, "secret", default),
            Times.Once);
    }
}
