using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Infrastructure.Parsers;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// Deterministic parsers (THINK-01), so every expected value is exact and read straight off the
/// fixture line. Fixtures are sanitized and made up; no real statement is used.
/// </summary>
public sealed class StatementParserTests
{
    // ── NeoBankPdfParser ──────────────────────────────────────────────────────

    private static readonly string FixturePath =
        Path.Combine(AppContext.BaseDirectory, "Fixtures", "NeoBank", "neobank_statement_sanitized.txt");

    /// <summary>Writes the text lines into a one-page PDF so the parser reads it through PdfPig.</summary>
    private static MemoryStream Pdf(IEnumerable<string> lines)
    {
        var builder = new PdfDocumentBuilder();
        var page = builder.AddPage(PageSize.A4);
        var font = builder.AddStandard14Font(Standard14Font.Helvetica);
        var y = 800d;
        foreach (var line in lines)
        {
            page.AddText(line + " ", 8, new PdfPoint(20, y), font);
            y -= 12;
        }
        return new MemoryStream(builder.Build());
    }

    private static (NeoBankPdfParser Parser, Mock<ICategoryRuleService> Rules) NeoBank()
    {
        var rules = new Mock<ICategoryRuleService>();
        rules.Setup(r => r.CategorizeBatchAsync(It.IsAny<List<TransactionDto>>()))
            .ReturnsAsync((List<TransactionDto> rows) => rows);
        return (new NeoBankPdfParser(rules.Object, NullLogger<NeoBankPdfParser>.Instance), rules);
    }

    [Fact]
    public async Task NeoBankPdfParser_SanitizedStatement_ParsesEachEntryExactlyAndSkipsNoise()
    {
        // Arrange: 4 real entries; the period line, the header, a bad month and a line without a
        // balance are skipped. Balances reconcile from an opening 250,000.00:
        // +5,000,000.00 = 5,250,000.00; −45,500.00 = 5,204,500.00; +1,234.56 = 5,205,734.56;
        // −1,000,000.50 = 4,205,734.06.
        var (parser, rules) = NeoBank();
        await using var pdf = Pdf(File.ReadAllLines(FixturePath));

        // Act
        var rows = await parser.ParseAsync(pdf);

        // Assert
        Assert.Equal(
        [
            new DateTime(2025, 4, 1, 3, 9, 22, DateTimeKind.Utc),
            new DateTime(2025, 4, 2, 12, 30, 0, DateTimeKind.Utc),
            new DateTime(2025, 4, 3, 0, 0, 0, DateTimeKind.Utc),
            new DateTime(2025, 4, 15, 23, 59, 59, DateTimeKind.Utc),
        ], rows.Select(r => r.Date));
        Assert.Equal(["Transfer Masuk BI-FAST", "QRIS KOPI KENANGAN", "Bunga Tabungan", "Pembayaran Tagihan PLN"],
            rows.Select(r => r.Description));
        Assert.Equal([5_000_000.00m, 45_500.00m, 1_234.56m, 1_000_000.50m], rows.Select(r => r.AmountIdr));
        Assert.Equal(["CR", "DB", "CR", "DB"], rows.Select(r => r.Flow));
        Assert.Equal(["Income", "Expense", "Income", "Expense"], rows.Select(r => r.Type));
        Assert.Equal([5_250_000.00m, 5_204_500.00m, 5_205_734.56m, 4_205_734.06m], rows.Select(r => r.StatementBalance));
        Assert.All(rows, r => Assert.Equal(("NeoBank", "IDR", "Uncategorized"), (r.AccountName, r.Currency, r.Category)));
        // Credits minus debits equals the balance movement: 5,001,234.56 − 1,045,500.50 = 3,955,734.06
        Assert.Equal(4_205_734.06m - 250_000.00m,
            rows.Where(r => r.Flow == "CR").Sum(r => r.AmountIdr) - rows.Where(r => r.Flow == "DB").Sum(r => r.AmountIdr));
        // PERF-01: categorized once for the whole statement.
        rules.Verify(r => r.CategorizeBatchAsync(It.Is<List<TransactionDto>>(l => l.Count == 4)), Times.Once);
    }

    [Fact]
    public async Task NeoBankPdfParser_CreditWhoseAmountEndsTheBalance_KeepsDescriptionClean()
    {
        // Arrange: 1,000,000.00 + 100,000.00 = 1,100,000.00. The balance text "1.100.000,00" ends with
        // the amount text "100.000,00".
        var (parser, _) = NeoBank();
        await using var pdf = Pdf(["21 Apr 2025 09:00:00 Refund Tokopedia 100.000,00 1.100.000,00"]);

        // Act
        var row = Assert.Single(await parser.ParseAsync(pdf));

        // Assert
        Assert.Equal(100_000.00m, row.AmountIdr);
        Assert.Equal(1_100_000.00m, row.StatementBalance);
        Assert.Equal("Refund Tokopedia", row.Description);
    }

    [Fact]
    public async Task NeoBankPdfParser_NoEntries_ReturnsEmptyAndStillCallsCategorizerOnce()
    {
        // Arrange
        var (parser, rules) = NeoBank();
        await using var pdf = Pdf(["NEO BANK - REKENING KORAN", "Tidak ada transaksi"]);

        // Act
        var rows = await parser.ParseAsync(pdf);

        // Assert
        Assert.Empty(rows);
        rules.Verify(r => r.CategorizeBatchAsync(It.IsAny<List<TransactionDto>>()), Times.Once);
    }
}
