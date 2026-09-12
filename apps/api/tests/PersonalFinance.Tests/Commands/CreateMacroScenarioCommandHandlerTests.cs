using Xunit;
using PersonalFinance.Application.Commands.MacroScenarios;

namespace PersonalFinance.Tests.Commands;

public class CreateMacroScenarioCommandHandlerTests
{
    [Fact]
    public void CreateMacroScenarioCommandValidator_EmptyName_FailsValidation()
    {
        // Arrange
        var validator = new CreateMacroScenarioCommandValidator();
        var command = new CreateMacroScenarioCommand("", "{\"i\":4.75}");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Name");
    }

    [Fact]
    public void CreateMacroScenarioCommandValidator_NameTooLong_FailsValidation()
    {
        // Arrange
        var validator = new CreateMacroScenarioCommandValidator();
        var command = new CreateMacroScenarioCommand(new string('a', 101), "{\"i\":4.75}");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Name");
    }

    [Fact]
    public void CreateMacroScenarioCommandValidator_InvalidJson_FailsValidation()
    {
        // Arrange
        var validator = new CreateMacroScenarioCommandValidator();
        var command = new CreateMacroScenarioCommand("My scenario", "{not valid json");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "DriversJson");
    }

    [Fact]
    public void CreateMacroScenarioCommandValidator_ValidCommand_PassesValidation()
    {
        // Arrange
        var validator = new CreateMacroScenarioCommandValidator();
        var command = new CreateMacroScenarioCommand("Oil shock scenario", "{\"i\":4.75,\"target\":3}");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.True(result.IsValid);
    }
}
