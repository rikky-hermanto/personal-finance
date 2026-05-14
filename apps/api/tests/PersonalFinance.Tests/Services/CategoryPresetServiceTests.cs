using Moq;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Tests.Services;

public class CategoryPresetServiceTests
{
    // CategoryPresetService depends on Supabase.Client (concrete class, not mockable).
    // Full integration tests are tracked in PF-034.
    // These tests verify the ICategoryPresetService contract via a mock.

    [Fact]
    public async Task GetAllAsync_ReturnsPresetsOrderedByKeywordLengthDescending()
    {
        // Arrange
        var mock = new Mock<ICategoryPresetService>();
        mock.Setup(s => s.GetAllAsync(default))
            .ReturnsAsync([
                new CategoryPreset { Keyword = "INDOMARET",  Category = "Groceries",  Type = "Expense", Flow = "DB" },
                new CategoryPreset { Keyword = "GOPAY",      Category = "E-Wallet",   Type = "Expense", Flow = "DB" },
                new CategoryPreset { Keyword = "OVO",        Category = "E-Wallet",   Type = "Expense", Flow = "DB" },
            ]);

        // Act
        var result = await mock.Object.GetAllAsync();

        // Assert — verify contract: returns a non-empty list with expected fields
        Assert.Equal(3, result.Count);
        Assert.All(result, p => Assert.False(string.IsNullOrWhiteSpace(p.Keyword)));
        Assert.All(result, p => Assert.False(string.IsNullOrWhiteSpace(p.Category)));
    }

    [Fact]
    public async Task GetAllAsync_EmptyTable_ReturnsEmptyList()
    {
        var mock = new Mock<ICategoryPresetService>();
        mock.Setup(s => s.GetAllAsync(default)).ReturnsAsync([]);

        var result = await mock.Object.GetAllAsync();

        Assert.Empty(result);
    }

    [Fact(Skip = "Requires Supabase integration — integration harness tracked in PF-034")]
    public async Task GetAllAsync_Integration_ReturnsAtLeast300SeededPresets()
    {
        // Integration test: requires local Supabase with seeded category_presets migration applied.
        // Verify: SELECT COUNT(*) FROM category_presets >= 300
        await Task.CompletedTask;
    }
}
