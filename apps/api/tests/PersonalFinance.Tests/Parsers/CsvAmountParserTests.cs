using System;
using Xunit;

namespace PersonalFinance.Tests.Parsers;

public class CsvAmountParserTests
{
    [Theory]
    [InlineData("800000.00", 800000.00)]
    [InlineData(" Rp800,000.00 ", 800000.00)]
    [InlineData("IDR 800.000,00", 800000.00)]
    [InlineData("$800", 800.00)]
    [InlineData("1,000,000.00", 1000000.00)] // US style
    [InlineData("1.000.000,00", 1000000.00)] // EU style
    [InlineData("931,51", 931.51)] // Ambiguous comma 1
    [InlineData("-100", 100.00)]
    [InlineData("(100)", 100.00)]
    public void Parse_VariousFormats_ReturnsCorrectDecimal(string input, decimal expected)
    {
        // Act
        var result = CsvAmountParser.Parse(input);

        // Assert
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData(null)]
    public void Parse_EmptyOrNull_ReturnsZero(string? input)
    {
        // Act
        var result = CsvAmountParser.Parse(input);

        // Assert
        Assert.Equal(0, result);
    }

    [Fact]
    public void Parse_InvalidString_ThrowsFormatException()
    {
        Assert.Throws<FormatException>(() => CsvAmountParser.Parse("not-a-number"));
    }

    [Fact]
    public void TryParse_ValidString_ReturnsTrueAndCorrectAmount()
    {
        var result = CsvAmountParser.TryParse(" Rp800,000.00 ", out var amount);
        
        Assert.True(result);
        Assert.Equal(800000.00m, amount);
    }

    [Fact]
    public void TryParse_InvalidString_ReturnsFalseAndZero()
    {
        var result = CsvAmountParser.TryParse("not-a-number", out var amount);
        
        Assert.False(result);
        Assert.Equal(0, amount);
    }
}
