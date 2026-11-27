using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// The branches of the five-stage pipeline that Services/CategorizationLayerTests does not reach:
/// the normalizers, every schema-validator rejection, the batch suggestion pass and the cold-start
/// category list.
/// </summary>
public sealed class TransactionPipelineServiceTests
{
    private sealed class Harness
    {
        public Mock<ITransactionService> Transactions { get; } = new();
        public Mock<ILlmCategorizationClient> Llm { get; } = new();
        public Mock<ICategoryRuleService> Rules { get; } = new();
        public Mock<ILlmSuggestionClient> Suggestions { get; } = new();

        public Harness()
        {
            Transactions.Setup(t => t.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
                .ReturnsAsync((IEnumerable<TransactionDto> rows) => rows.ToList());
            Rules.Setup(r => r.GetAllAsync()).ReturnsAsync([new CategoryRuleDto { Category = "Food" }]);
            Rules.Setup(r => r.AddAsync(It.IsAny<CategoryRuleDto>())).ReturnsAsync(new CategoryRuleDto());
            Suggestions.Setup(s => s.SuggestBatchAsync(It.IsAny<List<string>>(), It.IsAny<List<string>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync([]);
            Llm.Setup(l => l.CategorizeAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                    It.IsAny<decimal>(), It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new LlmCategorizationResult("Uncategorized", 0, false));
        }

        public TransactionPipelineService Build() => new(
            Transactions.Object, Llm.Object, Rules.Object, Suggestions.Object, NullLogger<TransactionPipelineService>.Instance);
    }

    private static TransactionDto Row(string description = "GOFOOD", decimal amount = 50_000m, string flow = "DB",
        string category = "Food", string currency = "IDR", DateTime? date = null) => new()
    {
        Date = date ?? new DateTime(2026, 3, 10, 0, 0, 0, DateTimeKind.Utc),
        Description = description, AmountIdr = amount, Flow = flow, Type = flow == "CR" ? "Income" : "Expense",
        Category = category, Currency = currency,
    };

    [Fact]
    public async Task ProcessAsync_EmptyList_ReturnsEmptyWithoutDedupQuery()
    {
        // Arrange
        var harness = new Harness();

        // Act
        var result = await harness.Build().ProcessAsync([]);

        // Assert
        Assert.Empty(result);
        harness.Transactions.Verify(t => t.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()), Times.Never);
    }

    [Fact]
    public async Task ProcessAsync_Normalizers_RoundAbsoluteAmountAndStandardizeCurrencyAndDate()
    {
        // Arrange
        var harness = new Harness();
        var unspecified = new DateTime(2026, 3, 10, 0, 0, 0, DateTimeKind.Unspecified);
        var local = new DateTime(2026, 3, 10, 8, 0, 0, DateTimeKind.Local);
        var rows = new List<TransactionDto>
        {
            Row(amount: -12_345.678m, currency: "Rp", date: unspecified),
            Row(amount: 10.005m, currency: " rp. "),
            Row(amount: 99.5m, currency: " usd ", date: local),
            Row(amount: 1m, currency: "  "),
        };

        // Act
        var result = await harness.Build().ProcessAsync(rows);

        // Assert
        // DecimalFixer: |round(-12,345.678, 2)| = 12,345.68; round(10.005, 2) is 10.00 (banker's rounding, to even)
        Assert.Equal([12_345.68m, 10.00m, 99.5m, 1m], result.Select(r => r.AmountIdr));
        Assert.Equal(["IDR", "IDR", "USD", "IDR"], result.Select(r => r.Currency));
        // DateNormalizer: an unspecified date is taken as UTC as-is; a local date is converted.
        Assert.Equal(DateTimeKind.Utc, result[0].Date.Kind);
        Assert.Equal(unspecified.Ticks, result[0].Date.Ticks);
        Assert.Equal(local.ToUniversalTime(), result[2].Date);
    }

    [Theory]
    [InlineData("", 50_000, "DB")]      // empty description
    [InlineData("   ", 50_000, "DB")]   // blank description
    [InlineData("GOFOOD", 0, "DB")]     // zero amount
    [InlineData("GOFOOD", 0.004, "DB")] // rounds to 0.00
    [InlineData("GOFOOD", 50_000, "")]  // no flow
    [InlineData("GOFOOD", 50_000, "XX")] // unknown flow
    public async Task ProcessAsync_InvalidRow_IsDroppedBySchemaValidator(string description, double amount, string flow)
    {
        // Arrange
        var harness = new Harness();
        var bad = Row(description, (decimal)amount, flow);
        var good = Row("GRAB", 25_000m);

        // Act
        var result = await harness.Build().ProcessAsync([bad, good]);

        // Assert
        Assert.Equal(["GRAB"], result.Select(r => r.Description));
    }

    [Fact]
    public async Task ProcessAsync_ConfidentBatchSuggestion_SeedsRuleAndCategorizesMatchingRowsWithoutPerRowCall()
    {
        // Arrange
        var harness = new Harness();
        harness.Suggestions.Setup(s => s.SuggestBatchAsync(It.IsAny<List<string>>(), It.IsAny<List<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([
                new MerchantSuggestion("WARUNG PADANG", "Food", "WARUNG", 0.90),
                new MerchantSuggestion("TOKO X", "Shopping", "TOKO", 0.50), // below 0.85: ignored
            ]);
        var rows = new List<TransactionDto>
        {
            Row("WARUNG PADANG SEDERHANA", category: "Uncategorized"),
            Row("warung kopi", category: "Uncategorized"),
            Row("TOKO X", category: "Uncategorized"),
        };

        // Act
        var result = await harness.Build().ProcessAsync(rows);

        // Assert
        Assert.Equal(["Food", "Food", "Uncategorized"], result.Select(r => r.Category));
        harness.Rules.Verify(r => r.AddAsync(It.Is<CategoryRuleDto>(d =>
            d.Keyword == "WARUNG" && d.Category == "Food" && d.Type == "Expense" && d.Flow == null)), Times.Once);
        harness.Rules.Verify(r => r.AddAsync(It.Is<CategoryRuleDto>(d => d.Category == "Shopping")), Times.Never);
        // Only the row the suggestions left uncategorized goes to the per-row categorizer.
        harness.Llm.Verify(l => l.CategorizeAsync("TOKO X", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<decimal>(),
            It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()), Times.Once);
        harness.Llm.Verify(l => l.CategorizeAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<decimal>(),
            It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()), Times.Once);
        harness.Rules.Verify(r => r.GetAllAsync(), Times.Once); // PERF-01: rules loaded once per batch
    }

    [Fact]
    public async Task ProcessAsync_SuggestionPatterns_StripPhoneNumbersNamesAndReferenceIds()
    {
        // Arrange
        var harness = new Harness();
        List<string>? sent = null;
        harness.Suggestions.Setup(s => s.SuggestBatchAsync(It.IsAny<List<string>>(), It.IsAny<List<string>>(), It.IsAny<CancellationToken>()))
            .Callback((List<string> patterns, List<string> _, CancellationToken _) => sent = patterns)
            .ReturnsAsync([]);
        var rows = new List<TransactionDto>
        {
            Row("TRF 081234567890 A/N BUDI SANTOSO", category: "Uncategorized"),
            Row("QRIS 1234567 KOPI KENANGAN", category: "Uncategorized"),
            Row("TRF/ABCDEF123456 SHOPEE", category: "Uncategorized"),
            Row("AB", category: "Uncategorized"),                  // too short after cleaning: not sent
            Row("QRIS 7654321 KOPI KENANGAN", category: "Uncategorized"), // same pattern as row 2: sent once
        };

        // Act
        await harness.Build().ProcessAsync(rows);

        // Assert
        Assert.Equal(["TRF", "QRIS KOPI KENANGAN", "TRF/ SHOPEE"], sent);
    }

    [Fact]
    public async Task ProcessAsync_NoRulesYet_OffersDefaultCategoryList()
    {
        // Arrange
        var harness = new Harness();
        harness.Rules.Setup(r => r.GetAllAsync()).ReturnsAsync([]);
        List<string>? offered = null;
        harness.Suggestions.Setup(s => s.SuggestBatchAsync(It.IsAny<List<string>>(), It.IsAny<List<string>>(), It.IsAny<CancellationToken>()))
            .Callback((List<string> _, List<string> categories, CancellationToken _) => offered = categories)
            .ReturnsAsync([]);

        // Act
        await harness.Build().ProcessAsync([Row("SOMETHING NEW", category: "Uncategorized")]);

        // Assert
        Assert.NotNull(offered);
        Assert.Equal(16, offered.Count);
        Assert.Contains("Food & Dining", offered);
        Assert.Contains("Investment", offered);
    }

    [Fact]
    public async Task ProcessAsync_AllRowsCategorized_SkipsLlmLayer()
    {
        // Arrange
        var harness = new Harness();

        // Act
        var result = await harness.Build().ProcessAsync([Row("GOFOOD", category: "Food")]);

        // Assert
        Assert.Single(result);
        harness.Rules.Verify(r => r.GetAllAsync(), Times.Never);
        harness.Suggestions.Verify(s => s.SuggestBatchAsync(It.IsAny<List<string>>(), It.IsAny<List<string>>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProcessAsync_DuplicateCheck_ReturnsOnlyWhatDedupKeeps()
    {
        // Arrange
        var harness = new Harness();
        harness.Transactions.Setup(t => t.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
            .ReturnsAsync((IEnumerable<TransactionDto> rows) => rows.Where(r => r.Description != "OLD").ToList());

        // Act
        var result = await harness.Build().ProcessAsync([Row("OLD"), Row("NEW")]);

        // Assert
        Assert.Equal(["NEW"], result.Select(r => r.Description));
    }
}
