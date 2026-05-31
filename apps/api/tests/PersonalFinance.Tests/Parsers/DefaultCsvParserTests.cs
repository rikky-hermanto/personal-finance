using Moq;
using Xunit;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Tests.Parsers;

public class DefaultCsvParserTests
{
    private readonly Mock<ICategoryRuleService> _categoryRuleServiceMock;
    private readonly Mock<ILogger<DefaultCsvParser>> _loggerMock;
    private readonly DefaultCsvParser _parser;

    public DefaultCsvParserTests()
    {
        _categoryRuleServiceMock = new Mock<ICategoryRuleService>();
        _loggerMock = new Mock<ILogger<DefaultCsvParser>>();

        // Passthrough mock — returns transactions unchanged (simulates post-fix CategorizeBatchAsync)
        _categoryRuleServiceMock
            .Setup(s => s.CategorizeBatchAsync(It.IsAny<List<TransactionDto>>()))
            .ReturnsAsync((List<TransactionDto> txns) => txns);

        _parser = new DefaultCsvParser(_categoryRuleServiceMock.Object, _loggerMock.Object);
    }

    [Theory]
    [InlineData("DD/MM/YYYY", "02/01/2024", 2024, 1, 2)] // Scenario A: 2 Jan 2024
    [InlineData("MM/DD/YYYY", "02/01/2024", 2024, 2, 1)] // Scenario B: 1 Feb 2024
    public async Task ParseAsync_CustomDateFormat_ParsesCorrectly(string dateFormat, string dateString, int year, int month, int day)
    {
        // Arrange
        using var stream = BuildCsv(dateString, "Desc", "", "DB", "Expense", "Food", "BCA", "1000", "", "1000", "IDR");

        // Act
        var result = await _parser.ParseAsync(stream, null, dateFormat);

        // Assert
        Assert.Single(result);
        Assert.Equal(new DateTime(year, month, day, 0, 0, 0, DateTimeKind.Utc), result[0].Date.Date);
    }

    [Fact]
    public async Task ParseAsync_NullDateFormat_FallbacksToBuiltIn()
    {
        // Scenario C: Should parse with default fallback
        using var stream = BuildCsv("2024-03-15", "Desc", "", "DB", "Expense", "Food", "BCA", "1000", "", "1000", "IDR");
        var result = await _parser.ParseAsync(stream, null, null);
        Assert.Single(result);
        Assert.Equal(new DateTime(2024, 3, 15, 0, 0, 0, DateTimeKind.Utc), result[0].Date.Date);
    }

    [Theory]
    [InlineData("DD/MM/YYYY HH:mm", "02/01/2024 23:15", 2024, 1, 2, 23, 15)] // 24h
    [InlineData("MM/DD/YYYY hh:mm tt", "02/01/2024 11:15 PM", 2024, 2, 1, 23, 15)] // AM/PM
    public async Task ParseAsync_CustomDateFormatWithTime_ParsesCorrectly(string dateFormat, string dateString, int year, int month, int day, int hour, int min)
    {
        using var stream = BuildCsv(dateString, "Desc", "", "DB", "Expense", "Food", "BCA", "1000", "", "1000", "IDR");
        var result = await _parser.ParseAsync(stream, null, dateFormat);
        Assert.Single(result);
        var dt = result[0].Date;
        Assert.Equal(new DateTime(year, month, day, hour, min, 0, DateTimeKind.Utc), dt);
    }

    [Fact]
    public async Task ParseAsync_AssetTrarType_MappedCorrectly()
    {
        // Scenario F: Type is "Asset Trar"
        using var stream = BuildCsv("1/1/2024", "Asset Transfer", "", "DB", "Asset Trar", "Asset", "BCA", "1000", "", "1000", "IDR");
        var result = await _parser.ParseAsync(stream);
        Assert.Single(result);
        Assert.Equal("Asset Trar", result[0].Type);
    }

    [Fact]
    public async Task ParseAsync_CRFlow_PositiveAmount()
    {
        // Scenario G: "CR" flow should be positive
        using var stream = BuildCsv("1/1/2024", "Salary", "", "CR", "Income", "Income", "BCA", "1000", "", "1000", "IDR");
        var result = await _parser.ParseAsync(stream);
        Assert.Single(result);
        Assert.True(result[0].AmountIdr > 0);
    }

    [Fact]
    public async Task ParseAsync_AmPmDateFormat_ParsedCorrectly()
    {
        // Arrange — Excel-style 12-hour AM/PM date
        var csv = BuildCsv("1/1/24 12:30 AM", "Coffee Shop", "", "DB", "Expense", "Food", "BCA", "45000", "", "45000", "IDR");

        // Act
        var result = await _parser.ParseAsync(csv);

        // Assert
        Assert.Single(result);
        Assert.Equal(new DateTime(2024, 1, 1, 0, 30, 0, DateTimeKind.Utc), result[0].Date);
    }

    [Fact]
    public async Task ParseAsync_AmPmDateFormatPm_ParsedCorrectly()
    {
        // Arrange — PM time should map to 24-hour correctly
        var csv = BuildCsv("1/15/24 3:45 PM", "Lunch", "", "DB", "Expense", "Food", "BCA", "50000", "", "50000", "IDR");

        // Act
        var result = await _parser.ParseAsync(csv);

        // Assert
        Assert.Single(result);
        Assert.Equal(new DateTime(2024, 1, 15, 15, 45, 0, DateTimeKind.Utc), result[0].Date);
    }

    [Fact]
    public async Task ParseAsync_BlankDateRow_IsSkipped()
    {
        // Arrange — one valid row followed by two trailing blank rows (typical Excel CSV export artifact)
        const string csv = "Date,Item,Remarks,Flow,Type,Category,Wallet,Amount,Exc. Rate,Amount (IDR),Currency\n" +
                           "1/1/24 9:00 AM,Kopi,Remarks,DB,Expense,Food,BCA,45000,,45000,IDR\n" +
                           ",,,,,,,,,\n" +
                           ",,,,,,,,,\n";

        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(csv));

        // Act
        var result = await _parser.ParseAsync(stream);

        // Assert — only the first row should be returned; blank rows must be skipped
        Assert.Single(result);
    }

    [Fact]
    public async Task ParseAsync_ExistingCategory_SurvivesCategorizeBatch()
    {
        // Arrange — CSV has an explicit Category value
        var csv = BuildCsv("1/1/24 9:00 AM", "Kopi Kenangan", "", "DB", "Expense", "Food & Drinks", "BCA", "45000", "", "45000", "IDR");

        // Act
        var result = await _parser.ParseAsync(csv);

        // Assert — mock returned transactions unchanged; category must be what was in the CSV
        Assert.Single(result);
        Assert.Equal("Food & Drinks", result[0].Category);
    }

    [Fact]
    public async Task ParseAsync_MasterSpreadsheetSchema_AllFieldsMapped()
    {
        // Arrange — full master schema with all columns present
        var csv = BuildCsv("1/5/24 10:30 AM", "Freelance Payment", "Transfer from Wise", "CR", "Income", "Bank Transfer", "Wise", "50", "15800", "790000", "USD");

        // Act
        var result = await _parser.ParseAsync(csv);

        // Assert
        Assert.Single(result);
        var tx = result[0];
        Assert.Equal("Freelance Payment", tx.Description);
        Assert.Equal("Transfer from Wise", tx.Remarks);
        Assert.Equal("CR", tx.Flow);
        Assert.Equal("Income", tx.Type);
        Assert.Equal("Bank Transfer", tx.Category);
        Assert.Equal("Wise", tx.AccountName);
        Assert.Equal("USD", tx.Currency);
        Assert.Equal(15800m, tx.ExchangeRate);
    }

    [Fact]
    public async Task ParseAsync_SemicolonDelimitedFile_ParsedCorrectly()
    {
        // Arrange — semicolon delimiter is what Excel emits on Indonesian/European locale systems
        const string csv = "Date;Item;Remarks;Flow;Type;Category;Wallet;Amount;Exc. Rate;Amount (IDR);Currency\n" +
                           "1/1/24 9:00 AM;Kopi Kenangan;DEBIT TRANSFER;DB;Expense;Food & Drinks;BCA;45000;;45000;IDR\n";

        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(csv));

        // Act
        var result = await _parser.ParseAsync(stream);

        // Assert
        Assert.Single(result);
        Assert.Equal("Kopi Kenangan", result[0].Description);
        Assert.Equal(45000m, result[0].AmountIdr);
    }

    [Fact]
    public async Task ParseAsync_IndonesianDecimalCommaInAmountIdr_ParsedAsDecimal()
    {
        // Arrange — Indonesian Excel exports use comma as decimal separator (e.g. "931,51" = 931.51 IDR)
        // Bug: the old check treated 2-digit-after-comma as thousands separator, turning 931,51 → 93151
        const string csv = "Date;Item;Remarks;Flow;Type;Category;Wallet;Amount;Exc. Rate;Amount (IDR);Currency\n" +
                           "1/1/24 9:00 AM;Transfer;Remarks;CR;Income;Bank Transfer;BCA;;; 931,51;IDR\n";
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(csv));

        // Act
        var result = await _parser.ParseAsync(stream);

        // Assert
        Assert.Single(result);
        Assert.Equal(931.51m, result[0].AmountIdr);
    }

    [Fact]
    public async Task ParseAsync_LargeIndonesianDecimalCommaInAmountIdr_ParsedAsDecimal()
    {
        // Arrange — large amount with comma decimal separator (e.g. "20101059,26" = 20101059.26 IDR)
        // Bug: old code stripped the comma → 2010105926 (100x wrong)
        const string csv = "Date;Item;Remarks;Flow;Type;Category;Wallet;Amount;Exc. Rate;Amount (IDR);Currency\n" +
                           "1/1/24 9:00 AM;Salary;Remarks;CR;Income;Income;BCA;;;20101059,26;IDR\n";
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(csv));

        // Act
        var result = await _parser.ParseAsync(stream);

        // Assert
        Assert.Single(result);
        Assert.Equal(20101059.26m, result[0].AmountIdr);
    }

    [Fact]
    public async Task ParseAsync_ThousandsCommaInAmountIdr_CommaStripped()
    {
        // Arrange — comma as thousands separator (3 digits after comma, e.g. "1,000" = 1000 IDR)
        const string csv = "Date;Item;Remarks;Flow;Type;Category;Wallet;Amount;Exc. Rate;Amount (IDR);Currency\n" +
                           "1/1/24 9:00 AM;ATM;Remarks;DB;Expense;Cash;BCA;;;1,000;IDR\n";
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(csv));

        // Act
        var result = await _parser.ParseAsync(stream);

        // Assert
        Assert.Single(result);
        Assert.Equal(1000m, result[0].AmountIdr);
    }

    // Builds a single-row CSV using master schema column headers
    private static Stream BuildCsv(string date, string item, string remarks, string flow, string type,
        string category, string wallet, string amount, string excRate, string amountIdr, string currency)
    {
        var csv = "Date,Item,Remarks,Flow,Type,Category,Wallet,Amount,Exc. Rate,Amount (IDR),Currency\n" +
                  $"{date},{item},{remarks},{flow},{type},{category},{wallet},{amount},{excRate},{amountIdr},{currency}\n";
        return new MemoryStream(System.Text.Encoding.UTF8.GetBytes(csv));
    }
}
