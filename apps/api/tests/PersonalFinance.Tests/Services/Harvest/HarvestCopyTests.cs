using System.Globalization;
using System.Text.RegularExpressions;
using PersonalFinance.Application.Services.Harvest;

namespace PersonalFinance.Tests.Services.Harvest;

public class HarvestCopyTests
{
    private static readonly Regex Shame = new(
        @"\b(fail\w*|bad|worse|worst|wast\w*|shame\w*|guilt\w*|lazy|behind|late|lost|lose|loss|miss\w*|broke\w*|streak\w*|overspen\w*|mistake\w*|careless|irresponsible)\b",
        RegexOptions.IgnoreCase);

    private static Dictionary<string, object?> Ev(params (string Key, object? Value)[] pairs) =>
        pairs.ToDictionary(p => p.Key, p => p.Value);

    [Fact]
    public void AllFixedText_EverySentence_HasNoShameWording()
    {
        // Act
        var offenders = HarvestCopy.AllFixedText().Where(t => Shame.IsMatch(t)).ToList();

        // Assert
        Assert.Empty(offenders);
    }

    [Fact]
    public void Reveal_EvidenceHasMonths_FormatsWithInvariantCulture()
    {
        // Arrange: Indonesian formatting would print "1,4"
        var previous = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = new CultureInfo("id-ID");
        try
        {
            // Act: a double, which is what Newtonsoft returns for a JSON 1.4
            var (glyph, line) = HarvestCopy.Reveal("l2.count_your_cushion", Ev(("months", 1.4)));

            // Assert
            Assert.Equal("🪴", glyph);
            Assert.Equal("You are covered for 1.4 months.", line);
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    [Theory]
    [InlineData(2L)]
    [InlineData(2)]
    [InlineData(2.0)]
    public void Reveal_WholeNumberOfAnyNumericType_ShowsOneDecimal(object months)
    {
        // Act
        var (_, line) = HarvestCopy.Reveal("l2.fence_posts", Ev(("months", months)));

        // Assert
        Assert.Equal("2.0 months of cover, one fence post higher.", line);
    }

    [Fact]
    public void Reveal_EvidenceKeyMissing_ReturnsNoLineInsteadOfInventingOne()
    {
        // Act
        var (_, line) = HarvestCopy.Reveal("l2.count_your_cushion", Ev());

        // Assert
        Assert.Null(line);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData(true)]
    [InlineData(null)]
    public void Reveal_EvidenceIsNotANumber_ReturnsNoLine(object? months)
    {
        // Act
        var (_, line) = HarvestCopy.Reveal("l2.count_your_cushion", Ev(("months", months)));

        // Assert
        Assert.Null(line);
    }

    [Fact]
    public void Reveal_StarCode_UsesStarGlyphAndNoLine()
    {
        // Act
        var (glyph, line) = HarvestCopy.Reveal("stars.spend_lt_income", Ev());

        // Assert
        Assert.Equal("⭐", glyph);
        Assert.Null(line);
    }

    [Fact]
    public void Basis_NoAccountsAtAll_FallsBackToUploadedTransactions()
    {
        Assert.Equal("Based on your uploaded transactions", HarvestCopy.Basis(0, 0));
    }
}
