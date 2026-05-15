using FluentValidation;
using FluentValidation.Results;
using Microsoft.Extensions.Logging;
using Moq;
using PersonalFinance.Application.Commands.Institutions;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Commands;

public class CreateInstitutionCommandHandlerTests
{
    private readonly Mock<IValidator<CreateInstitutionCommand>> _validatorMock;
    private readonly Mock<ILogger<CreateInstitutionCommandHandler>> _loggerMock;

    public CreateInstitutionCommandHandlerTests()
    {
        _validatorMock = new Mock<IValidator<CreateInstitutionCommand>>();
        _loggerMock = new Mock<ILogger<CreateInstitutionCommandHandler>>();
    }

    [Fact]
    public void CreateInstitutionCommand_ValidCommand_HasCorrectProperties()
    {
        // Arrange
        var command = new CreateInstitutionCommand("BCA", "bank", "ID", null);

        // Assert
        Assert.Equal("BCA", command.Name);
        Assert.Equal("bank", command.Type);
        Assert.Equal("ID", command.Country);
        Assert.Null(command.LogoUrl);
    }

    [Fact]
    public async Task Handle_InvalidName_ThrowsValidationException()
    {
        // Arrange — mock ValidateAsync (the interface method); ValidateAndThrowAsync calls it internally
        var command = new CreateInstitutionCommand("", "bank");
        var validator = new CreateInstitutionCommandValidator();

        var handler = new CreateInstitutionCommandHandler(
            null!,
            validator,
            _loggerMock.Object
        );

        // Act & Assert
        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.Handle(command, CancellationToken.None));
    }

    [Fact]
    public void CreateInstitutionCommandValidator_EmptyName_FailsValidation()
    {
        // Arrange
        var validator = new CreateInstitutionCommandValidator();
        var command = new CreateInstitutionCommand("", "bank");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Name");
    }

    [Fact]
    public void CreateInstitutionCommandValidator_InvalidType_FailsValidation()
    {
        // Arrange
        var validator = new CreateInstitutionCommandValidator();
        var command = new CreateInstitutionCommand("BCA", "invalid_type");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Type");
    }

    [Fact]
    public void CreateInstitutionCommandValidator_ValidCommand_PassesValidation()
    {
        // Arrange
        var validator = new CreateInstitutionCommandValidator();
        var command = new CreateInstitutionCommand("BCA", "bank", "ID");

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.True(result.IsValid);
    }
}
