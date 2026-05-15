using Xunit;
using PersonalFinance.Application.Commands.Assets;

namespace PersonalFinance.Tests.Commands;

public class CreateAssetCommandHandlerTests
{
    [Fact]
    public void CreateAssetCommandValidator_EmptyName_FailsValidation()
    {
        // Arrange
        var validator = new CreateAssetCommandValidator();
        var command = new CreateAssetCommand("", "cash", null, null, null, "IDR");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Name");
    }

    [Fact]
    public void CreateAssetCommandValidator_InvalidAssetClass_FailsValidation()
    {
        // Arrange
        var validator = new CreateAssetCommandValidator();
        var command = new CreateAssetCommand("My House", "real_property", null, null, null, "IDR");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "AssetClass");
    }

    [Fact]
    public void CreateAssetCommandValidator_ValidCommand_PassesValidation()
    {
        // Arrange
        var validator = new CreateAssetCommandValidator();
        var command = new CreateAssetCommand("Jakarta Property", "real_estate", null, null, 2_500_000_000m, "IDR");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.True(result.IsValid);
    }
}
