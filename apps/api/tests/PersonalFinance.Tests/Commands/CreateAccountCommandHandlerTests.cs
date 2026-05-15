using FluentValidation;
using FluentValidation.Results;
using Microsoft.Extensions.Logging;
using Moq;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Commands;

public class CreateAccountCommandHandlerTests
{
    [Fact]
    public async Task Handle_InvalidName_ThrowsValidationException()
    {
        // Arrange — mock ValidateAsync (the interface method); ValidateAndThrowAsync calls it internally
        var command = new CreateAccountCommand(null, "", "checking", "IDR", 0, DateOnly.FromDateTime(DateTime.Today));
        var validator = new CreateAccountCommandValidator();

        var handler = new CreateAccountCommandHandler(
            null!,
            validator,
            new Mock<ILogger<CreateAccountCommandHandler>>().Object
        );

        // Act & Assert
        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.Handle(command, CancellationToken.None));
    }

    [Fact]
    public void CreateAccountCommandValidator_EmptyName_FailsValidation()
    {
        // Arrange
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(null, "", "checking", "IDR", 0, DateOnly.FromDateTime(DateTime.Today));

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Name");
    }

    [Fact]
    public void CreateAccountCommandValidator_InvalidAccountType_FailsValidation()
    {
        // Arrange
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(null, "Checking Account", "invalid_type", "IDR", 0, DateOnly.FromDateTime(DateTime.Today));

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "AccountType");
    }

    [Fact]
    public void CreateAccountCommandValidator_ValidCommand_PassesValidation()
    {
        // Arrange
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(null, "BCA Savings", "savings", "IDR", 0, DateOnly.FromDateTime(DateTime.Today));

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.True(result.IsValid);
    }
}
