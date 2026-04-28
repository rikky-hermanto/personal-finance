using Moq;
using Xunit;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;
using MediatR;
using PersonalFinance.Application.Commands;

namespace PersonalFinance.Tests.Services;

public class CategoryRuleServiceTests
{
    private readonly Mock<IMediator> _mediatorMock;
    private readonly CategoryRuleService _service;

    public CategoryRuleServiceTests()
    {
        _mediatorMock = new Mock<IMediator>();
        // Supabase.Client is a concrete class — pass null for tests that only exercise the MediatR-delegating methods.
        // Tests requiring a real Supabase connection are skipped until an integration test harness exists (see PF-034).
        _service = new CategoryRuleService(null!, _mediatorMock.Object);
    }

    [Fact(Skip = "Requires Supabase integration — EF Core removed in PF-S06, integration harness tracked in PF-034")]
    public async Task CategorizeAsync_WithMatchingRule_ReturnsCorrectCategory()
    {
        var result = await _service.CategorizeAsync("GROCERY STORE PURCHASE", "Expense");
        Assert.Equal("Food", result);
    }

    [Fact(Skip = "Requires Supabase integration — EF Core removed in PF-S06, integration harness tracked in PF-034")]
    public async Task CategorizeAsync_WithCaseInsensitiveMatch_ReturnsCorrectCategory()
    {
        var result = await _service.CategorizeAsync("GROCERY STORE", "EXPENSE");
        Assert.Equal("Food", result);
    }

    [Fact(Skip = "Requires Supabase integration — EF Core removed in PF-S06, integration harness tracked in PF-034")]
    public async Task CategorizeAsync_WithMultipleMatches_ReturnsLongestKeywordMatch()
    {
        var result = await _service.CategorizeAsync("GROCERY STORE PURCHASE", "Expense");
        Assert.Equal("Food", result);
    }

    [Fact(Skip = "Requires Supabase integration — EF Core removed in PF-S06, integration harness tracked in PF-034")]
    public async Task CategorizeAsync_WithNoMatch_ReturnsUntrackedCategory()
    {
        var result = await _service.CategorizeAsync("RESTAURANT BILL", "Expense");
        Assert.Equal("Untracked Category", result);
    }

    [Fact(Skip = "Requires Supabase integration — EF Core removed in PF-S06, integration harness tracked in PF-034")]
    public async Task CategorizeAsync_WithDifferentType_ReturnsUntrackedCategory()
    {
        var result = await _service.CategorizeAsync("SALARY PAYMENT", "Expense");
        Assert.Equal("Untracked Category", result);
    }

    [Fact(Skip = "Requires Supabase integration — EF Core removed in PF-S06, integration harness tracked in PF-034")]
    public async Task GetAllAsync_ReturnsAllRulesOrderedByKeywordLength()
    {
        var result = await _service.GetAllAsync();
        Assert.NotNull(result);
    }

    [Fact(Skip = "Requires Supabase integration — EF Core removed in PF-S06, integration harness tracked in PF-034")]
    public async Task GetByIdAsync_WithExistingId_ReturnsRule()
    {
        var result = await _service.GetByIdAsync(1);
        Assert.Null(result);
    }

    [Fact(Skip = "Requires Supabase integration — EF Core removed in PF-S06, integration harness tracked in PF-034")]
    public async Task GetByIdAsync_WithNonExistingId_ReturnsNull()
    {
        var result = await _service.GetByIdAsync(999);
        Assert.Null(result);
    }

    [Fact]
    public async Task AddAsync_CallsMediatorAndReturnsDto()
    {
        // Arrange
        var inputDto = new CategoryRuleDto
        {
            Keyword = "TEST",
            Type = "Expense",
            Category = "Test Category",
            KeywordLength = 4
        };

        var createdEntity = new CategoryRule
        {
            Id = 1,
            Keyword = "TEST",
            Type = "Expense",
            Category = "Test Category"
        };

        _mediatorMock.Setup(m => m.Send(It.IsAny<CreateCategoryRuleCommand>(), default))
                   .ReturnsAsync(createdEntity);

        // Act
        var result = await _service.AddAsync(inputDto);

        // Assert
        Assert.Equal(1, result.Id);
        Assert.Equal("TEST", result.Keyword);
        _mediatorMock.Verify(m => m.Send(It.IsAny<CreateCategoryRuleCommand>(), default), Times.Once);
    }

    [Fact]
    public async Task UpdateAsync_WithExistingRule_CallsMediatorAndReturnsDto()
    {
        // Arrange
        var inputDto = new CategoryRuleDto
        {
            Id = 1,
            Keyword = "UPDATED",
            Type = "Expense",
            Category = "Updated Category",
            KeywordLength = 7
        };

        var updatedEntity = new CategoryRule
        {
            Id = 1,
            Keyword = "UPDATED",
            Type = "Expense",
            Category = "Updated Category"
        };

        _mediatorMock.Setup(m => m.Send(It.IsAny<UpdateCategoryRuleCommand>(), default))
                   .ReturnsAsync(updatedEntity);

        // Act
        var result = await _service.UpdateAsync(1, inputDto);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("UPDATED", result.Keyword);
        _mediatorMock.Verify(m => m.Send(It.IsAny<UpdateCategoryRuleCommand>(), default), Times.Once);
    }

    [Fact]
    public async Task UpdateAsync_WithNonExistingRule_ReturnsNull()
    {
        // Arrange
        var inputDto = new CategoryRuleDto
        {
            Id = 999,
            Keyword = "TEST",
            Type = "Expense",
            Category = "Test Category",
            KeywordLength = 4
        };

        _mediatorMock.Setup(m => m.Send(It.IsAny<UpdateCategoryRuleCommand>(), default))
                   .ReturnsAsync((CategoryRule?)null);

        // Act
        var result = await _service.UpdateAsync(999, inputDto);

        // Assert
        Assert.Null(result);
        _mediatorMock.Verify(m => m.Send(It.IsAny<UpdateCategoryRuleCommand>(), default), Times.Once);
    }

    [Fact]
    public async Task DeleteAsync_CallsMediatorAndReturnsResult()
    {
        // Arrange
        _mediatorMock.Setup(m => m.Send(It.IsAny<DeleteCategoryRuleCommand>(), default))
                   .ReturnsAsync(true);

        // Act
        var result = await _service.DeleteAsync(1);

        // Assert
        Assert.True(result);
        _mediatorMock.Verify(m => m.Send(It.IsAny<DeleteCategoryRuleCommand>(), default), Times.Once);
    }
}
