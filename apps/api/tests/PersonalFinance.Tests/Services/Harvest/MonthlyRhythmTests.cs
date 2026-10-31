using System.Globalization;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services.Harvest;

namespace PersonalFinance.Tests.Services.Harvest;

public class MonthlyRhythmTests
{
    [Theory]
    [InlineData("", "2026-09", 0, 0)]                                                // nothing yet
    [InlineData("2026-09", "2026-09", 1, 1)]                                         // first harvest
    [InlineData("2026-07,2026-08,2026-09", "2026-09", 3, 3)]                         // consecutive
    [InlineData("2026-07,2026-09,2026-10", "2026-10", 3, 3)]                         // one skip in the quarter keeps it
    [InlineData("2026-04,2026-05,2026-06,2026-08,2026-10,2026-11", "2026-11", 2, 4)] // second skip in Q3 restarts
    [InlineData("2026-03,2026-05,2026-06,2026-07,2026-09", "2026-09", 5, 5)]         // skips in different quarters are both free
    [InlineData("2026-01,2026-02,2026-05", "2026-05", 1, 2)]                         // two missing months in a row restart
    [InlineData("2026-01,2026-02,2026-03", "2026-04", 3, 3)]                         // last finished month still pending: alive
    [InlineData("2026-01,2026-02,2026-03", "2026-05", 0, 3)]                         // two finished months without one: ended quietly
    [InlineData("2025-11,2025-12,2026-01", "2026-01", 3, 3)]                         // year boundary
    [InlineData("2025-11,2026-01", "2026-01", 2, 2)]                                 // December skipped between Nov and Jan
    [InlineData("2026-09,2026-10", "2026-09", 1, 1)]                                 // months after the last finished month are ignored
    public void Compute_ByCase_ReturnsCurrentAndLongest(string harvested, string lastFull, int current, int longest)
    {
        // Arrange
        var months = harvested.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(ParseMonth).ToList();

        // Act
        var result = MonthlyRhythm.Compute(months, ParseMonth(lastFull));

        // Assert
        Assert.Equal(new RhythmDto(current, longest), result);
    }

    [Fact]
    public void Compute_DuplicatesAndMidMonthDates_AreNormalised()
    {
        // Arrange
        DateOnly[] months = [new(2026, 9, 15), new(2026, 9, 1)];

        // Act
        var result = MonthlyRhythm.Compute(months, new DateOnly(2026, 9, 30));

        // Assert
        Assert.Equal(new RhythmDto(1, 1), result);
    }

    private static DateOnly ParseMonth(string s) =>
        DateOnly.ParseExact(s + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture);
}
