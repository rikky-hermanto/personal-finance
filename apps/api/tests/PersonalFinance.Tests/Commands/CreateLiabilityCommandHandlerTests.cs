using Xunit;
using PersonalFinance.Application.Commands.Liabilities;

namespace PersonalFinance.Tests.Commands;

public class CreateLiabilityCommandHandlerTests
{
    [Fact]
    public void CreateLiabilityCommandValidator_EmptyName_FailsValidation()
    {
        // Arrange
        var validator = new CreateLiabilityCommandValidator();
        var command = new CreateLiabilityCommand("", "revolving", 1_000_000m, DateOnly.FromDateTime(DateTime.Today));

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Name");
    }

    [Fact]
    public void CreateLiabilityCommandValidator_BothAccountAndAsset_FailsValidation()
    {
        // Arrange
        var validator = new CreateLiabilityCommandValidator();
        var command = new CreateLiabilityCommand(
            "KPR Rumah", "installment", 500_000_000m,
            DateOnly.FromDateTime(DateTime.Today),
            AccountId: Guid.NewGuid(),
            AssetId: Guid.NewGuid()
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.ErrorMessage.Contains("simultaneously"));
    }

    [Fact]
    public void CreateLiabilityCommandValidator_ZeroPrincipal_FailsValidation()
    {
        // Arrange
        var validator = new CreateLiabilityCommandValidator();
        var command = new CreateLiabilityCommand("Credit Card", "revolving", 0m, DateOnly.FromDateTime(DateTime.Today));

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Principal");
    }

    [Fact]
    public void CreateLiabilityCommandValidator_ValidMortgage_PassesValidation()
    {
        // Arrange
        var validator = new CreateLiabilityCommandValidator();
        var command = new CreateLiabilityCommand(
            "KPR Rumah", "installment", 500_000_000m,
            DateOnly.FromDateTime(DateTime.Today),
            AssetId: Guid.NewGuid()
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.True(result.IsValid);
    }
}
