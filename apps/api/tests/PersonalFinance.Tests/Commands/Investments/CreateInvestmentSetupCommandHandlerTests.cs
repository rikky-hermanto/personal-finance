using FluentValidation;
using Moq;
using Xunit;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Investments;
using PersonalFinance.Application.Investments;

namespace PersonalFinance.Tests.Commands.Investments;

public class CreateInvestmentSetupCommandHandlerTests
{
    private readonly CreateInvestmentSetupCommandValidator _validator = new();

    [Fact]
    public async Task Validate_WithValidCommand_Passes()
    {
        var cmd = new CreateInvestmentSetupCommand("My Portfolio", "balanced", "IDR");
        var result = await _validator.ValidateAsync(cmd);
        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task Validate_EmptyName_Fails()
    {
        var cmd = new CreateInvestmentSetupCommand("", "balanced", "IDR");
        var result = await _validator.ValidateAsync(cmd);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(cmd.Name));
    }

    [Fact]
    public async Task Validate_UnknownArchetypeId_Fails()
    {
        var cmd = new CreateInvestmentSetupCommand("My Portfolio", "nonexistent-archetype", "IDR");
        var result = await _validator.ValidateAsync(cmd);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(cmd.ArchetypeId));
    }

    [Fact]
    public async Task Validate_AllArchetypesValid()
    {
        foreach (var id in ArchetypeCatalog.All.Keys)
        {
            var cmd = new CreateInvestmentSetupCommand("Portfolio", id, "IDR");
            var result = await _validator.ValidateAsync(cmd);
            Assert.True(result.IsValid, $"Archetype '{id}' should be valid");
        }
    }
}
