using Moq;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

public class CategorizePreviewCommandHandlerTests
{
    private static Mock<ILlmSuggestionClient> SuggestionClient(
        List<MerchantSuggestion>? returns = null)
    {
        var mock = new Mock<ILlmSuggestionClient>();
        mock.Setup(x => x.SuggestBatchAsync(
                It.IsAny<List<string>>(),
                It.IsAny<List<string>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(returns ?? []);
        return mock;
    }

    private static Mock<ICategoryRuleService> CategoryService(List<string> categories)
    {
        var mock = new Mock<ICategoryRuleService>();
        mock.Setup(x => x.GetAllAsync())
            .ReturnsAsync(categories.Select(c => new CategoryRuleDto { Category = c }).ToList());
        return mock;
    }

    [Fact]
    public async Task Handle_WithSuggestions_ReturnsMappedResults()
    {
        // Arrange
        var suggestions = new List<MerchantSuggestion>
        {
            new("BI-FAST CR TRANSFER", "Transfer", "BI-FAST", 0.92),
            new("KARTU KREDIT/PL BCA CARD", "Transfer", "KARTU KREDIT", 0.88),
        };
        var handler = new CategorizePreviewCommandHandler(
            SuggestionClient(suggestions).Object,
            CategoryService(["Transfer", "Income", "Food"]).Object);

        var command = new CategorizePreviewCommand(
            ["BI-FAST CR TRANSFER", "KARTU KREDIT/PL BCA CARD"],
            ["Transfer", "Income", "Food"]);

        // Act
        var result = await handler.Handle(command, default);

        // Assert
        Assert.Equal(2, result.Count);
        Assert.Equal("Transfer", result[0].Category);
        Assert.Equal(0.92, result[0].Confidence, precision: 2);
    }

    [Fact]
    public async Task Handle_EmptyAvailableCategories_LoadsFromService()
    {
        // Arrange — no categories in request, handler should call GetAllAsync
        var catService = CategoryService(["Transfer", "Food"]);
        var handler = new CategorizePreviewCommandHandler(
            SuggestionClient().Object, catService.Object);

        var command = new CategorizePreviewCommand(["some description"], []);

        // Act
        await handler.Handle(command, default);

        // Assert
        catService.Verify(x => x.GetAllAsync(), Times.Once);
    }

    [Fact]
    public async Task Handle_EmptyDescriptions_ReturnsEmpty()
    {
        var handler = new CategorizePreviewCommandHandler(
            SuggestionClient().Object,
            CategoryService(["Transfer"]).Object);

        var result = await handler.Handle(
            new CategorizePreviewCommand([], ["Transfer"]), default);

        Assert.Empty(result);
    }
}
