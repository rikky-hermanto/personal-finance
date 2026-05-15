using Xunit;
using PersonalFinance.Application.Commands.Valuations;

namespace PersonalFinance.Tests.Commands;

public class CreateValuationCommandHandlerTests
{
    [Fact]
    public void CreateValuationCommandValidator_InvalidSubjectType_FailsValidation()
    {
        // Arrange
        var validator = new CreateValuationCommandValidator();
        var command = new CreateValuationCommand("portfolio", Guid.NewGuid(), 1000m, "IDR");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "SubjectType");
    }

    [Fact]
    public void CreateValuationCommandValidator_NegativeValue_FailsValidation()
    {
        // Arrange
        var validator = new CreateValuationCommandValidator();
        var command = new CreateValuationCommand("account", Guid.NewGuid(), -100m, "IDR");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "ValueNative");
    }

    [Fact]
    public void CreateValuationCommandValidator_ValidUsdValuation_PassesValidation()
    {
        // Arrange
        var validator = new CreateValuationCommandValidator();
        var command = new CreateValuationCommand("account", Guid.NewGuid(), 1000m, "USD");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.True(result.IsValid);
    }
}
