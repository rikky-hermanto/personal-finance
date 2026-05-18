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

    [Theory]
    [InlineData("checking")]
    [InlineData("savings")]
    [InlineData("credit_card")]
    [InlineData("brokerage")]
    [InlineData("wallet")]
    [InlineData("loan")]
    public void CreateAccountCommandValidator_AllSupportedAccountTypes_PassValidation(string accountType)
    {
        // Arrange
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(null, "My Account", accountType, "IDR", 0, DateOnly.FromDateTime(DateTime.Today));

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.True(result.IsValid, $"Expected '{accountType}' to pass but got: {string.Join(", ", result.Errors.Select(e => e.ErrorMessage))}");
    }

    [Fact]
    public void CreateAccountCommandValidator_CurrencyTooShort_FailsValidation()
    {
        // Arrange
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(null, "My Account", "savings", "ID", 0, DateOnly.FromDateTime(DateTime.Today));

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Currency");
    }

    [Fact]
    public void CreateAccountCommandValidator_CurrencyTooLong_FailsValidation()
    {
        // Arrange
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(null, "My Account", "savings", "IDRR", 0, DateOnly.FromDateTime(DateTime.Today));

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Currency");
    }

    [Fact]
    public void CreateAccountCommandValidator_NegativeOpeningBalance_FailsValidation()
    {
        // Arrange
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(null, "My Account", "savings", "IDR", -1m, DateOnly.FromDateTime(DateTime.Today));

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "OpeningBalance");
    }

    [Fact]
    public void CreateAccountCommandValidator_ZeroOpeningBalance_PassesValidation()
    {
        // Arrange — zero balance is valid (new empty account)
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(null, "My Account", "savings", "IDR", 0m, DateOnly.FromDateTime(DateTime.Today));

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.True(result.IsValid);
    }

    // ── CashflowInclusion business rule (embedded in CreateAccountCommandHandler) ──

    [Theory]
    [InlineData("brokerage",   false)]
    [InlineData("loan",        false)]
    [InlineData("checking",    true)]
    [InlineData("savings",     true)]
    [InlineData("credit_card", true)]
    [InlineData("wallet",      true)]
    public void AccountType_CashflowInclusion_MatchesExpected(string accountType, bool expectedIncludeInCashflow)
    {
        // This rule is embedded in CreateAccountCommandHandler:
        // investment/debt accounts are excluded from the cashflow view by default.
        var excludeFromCashflow = new HashSet<string> { "brokerage", "loan" };
        var includeInCashflow = !excludeFromCashflow.Contains(accountType);

        Assert.Equal(expectedIncludeInCashflow, includeInCashflow);
    }
}
