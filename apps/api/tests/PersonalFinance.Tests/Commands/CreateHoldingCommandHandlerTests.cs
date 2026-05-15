using Xunit;
using PersonalFinance.Application.Commands.Holdings;

namespace PersonalFinance.Tests.Commands;

public class CreateHoldingCommandHandlerTests
{
    [Fact]
    public void CreateHoldingCommandValidator_EmptyTicker_FailsValidation()
    {
        // Arrange
        var validator = new CreateHoldingCommandValidator();
        var command = new CreateHoldingCommand(Guid.NewGuid(), "", 100m, 5_000_000m, "IDR");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Ticker");
    }

    [Fact]
    public void CreateHoldingCommandValidator_ZeroQuantity_FailsValidation()
    {
        // Arrange
        var validator = new CreateHoldingCommandValidator();
        var command = new CreateHoldingCommand(Guid.NewGuid(), "BBRI", 0m, 0m, "IDR");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Quantity");
    }

    [Fact]
    public void CreateHoldingCommandValidator_ValidCommand_PassesValidation()
    {
        // Arrange
        var validator = new CreateHoldingCommandValidator();
        var command = new CreateHoldingCommand(Guid.NewGuid(), "BBRI", 100m, 5_000_000m, "IDR");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.True(result.IsValid);
    }
}
