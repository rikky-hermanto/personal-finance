using FluentValidation;
using Moq;
using Xunit;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Investments;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Dtos;
using System.Text.Json.Nodes;

namespace PersonalFinance.Tests.Commands.Investments;

public class RunPortfolioReviewCommandValidatorTests
{
    private readonly RunPortfolioReviewCommandValidator _validator = new();

    [Fact]
    public async Task Validate_ValidCommand_Passes()
    {
        var cmd = new RunPortfolioReviewCommand(
            SetupId: Guid.NewGuid(),
            Label: "May 2026 review",
            TotalValue: 100_000_000,
            Currency: "IDR"
        );
        var result = await _validator.ValidateAsync(cmd);
        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task Validate_EmptyLabel_Fails()
    {
        var cmd = new RunPortfolioReviewCommand(SetupId: Guid.NewGuid(), Label: "");
        var result = await _validator.ValidateAsync(cmd);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(cmd.Label));
    }

    [Fact]
    public async Task Validate_NegativeTotalValue_Fails()
    {
        var cmd = new RunPortfolioReviewCommand(
            SetupId: Guid.NewGuid(), Label: "Review", TotalValue: -1);
        var result = await _validator.ValidateAsync(cmd);
        Assert.False(result.IsValid);
    }
}

public class IPortfolioReviewClientContractTests
{
    [Fact]
    public void PortfolioReviewResponseDto_CanBeConstructed()
    {
        var dto = new PortfolioReviewResponseDto(
            Diagnostics: null,
            HoldingsEvaluation: null,
            MacroMap: null,
            Scenarios: null,
            ResilienceTest: null,
            DecisionTree: null,
            RecommendedPortfolio: null
        );
        Assert.NotNull(dto);
    }
}

public class PortfolioReviewResponseProvenanceTests
{
    // Same options PortfolioReviewClient uses to read the AI service's response.
    private static readonly System.Text.Json.JsonSerializerOptions ClientJson = new()
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    [Fact]
    public void Deserialize_ServiceResponseWithProviderAndModel_MapsBothFields()
    {
        // Arrange
        const string json = "{\"diagnostics\":{},\"provider\":\"gemini\",\"model\":\"gemini-2.5-flash\"}";

        // Act
        var dto = System.Text.Json.JsonSerializer.Deserialize<PortfolioReviewResponseDto>(json, ClientJson);

        // Assert
        Assert.NotNull(dto);
        Assert.Equal("gemini", dto!.Provider);
        Assert.Equal("gemini-2.5-flash", dto.Model);
    }

    [Fact]
    public void Deserialize_ResponseWithoutProvenance_LeavesFieldsNull()
    {
        // Arrange
        const string json = "{\"diagnostics\":{}}";

        // Act
        var dto = System.Text.Json.JsonSerializer.Deserialize<PortfolioReviewResponseDto>(json, ClientJson);

        // Assert
        Assert.Null(dto!.Provider);
        Assert.Null(dto.Model);
    }
}
