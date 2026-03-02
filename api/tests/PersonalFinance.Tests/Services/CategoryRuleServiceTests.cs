using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;
using PersonalFinance.Application;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Persistence;
using MediatR;
using PersonalFinance.Application.Commands;

namespace PersonalFinance.Tests.Services;

public class CategoryRuleServiceTests : IDisposable
{
    private readonly AppDbContext _dbContext;
    private readonly Mock<IMediator> _mediatorMock;
    private readonly CategoryRuleService _service;

    public CategoryRuleServiceTests()
    {   
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        
        _dbContext = new AppDbContext(options);
        _mediatorMock = new Mock<IMediator>();
        _service = new CategoryRuleService(_dbContext, _mediatorMock.Object);
    }

    [Fact]
    public async Task CategorizeAsync_WithMatchingRule_ReturnsCorrectCategory()
    {
        // Arrange
        var rules = new List<CategoryRule>
        {
            new CategoryRule { Id = 1, Keyword = "GROCERY", Type = "Expense", Category = "Food", KeywordLength = 7 },
            new CategoryRule { Id = 2, Keyword = "GAS", Type = "Expense", Category = "Transportation", KeywordLength = 3 }
        };
        
        await _dbContext.CategoryRules.AddRangeAsync(rules);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _service.CategorizeAsync("GROCERY STORE PURCHASE", "Expense");

        // Assert
        Assert.Equal("Food", result);
    }

    [Fact]
    public async Task CategorizeAsync_WithCaseInsensitiveMatch_ReturnsCorrectCategory()
    {
        // Arrange
        var rule = new CategoryRule { Id = 1, Keyword = "grocery", Type = "expense", Category = "Food", KeywordLength = 7 };
        await _dbContext.CategoryRules.AddAsync(rule);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _service.CategorizeAsync("GROCERY STORE", "EXPENSE");

        // Assert
        Assert.Equal("Food", result);
    }

    [Fact]
    public async Task CategorizeAsync_WithMultipleMatches_ReturnsLongestKeywordMatch()
    {
        // Arrange
        var rules = new List<CategoryRule>
        {
            new CategoryRule { Id = 1, Keyword = "STORE", Type = "Expense", Category = "Shopping", KeywordLength = 5 },
            new CategoryRule { Id = 2, Keyword = "GROCERY STORE", Type = "Expense", Category = "Food", KeywordLength = 12 }
        };
        
        await _dbContext.CategoryRules.AddRangeAsync(rules);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _service.CategorizeAsync("GROCERY STORE PURCHASE", "Expense");

        // Assert
        Assert.Equal("Food", result);
    }

    [Fact]
    public async Task CategorizeAsync_WithNoMatch_ReturnsUntrackedCategory()
    {
        // Arrange
        var rule = new CategoryRule { Id = 1, Keyword = "GROCERY", Type = "Expense", Category = "Food", KeywordLength = 7 };
        await _dbContext.CategoryRules.AddAsync(rule);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _service.CategorizeAsync("RESTAURANT BILL", "Expense");

        // Assert
        Assert.Equal("Untracked Category", result);
    }

    [Fact]
    public async Task CategorizeAsync_WithDifferentType_ReturnsUntrackedCategory()
    {
        // Arrange
        var rule = new CategoryRule { Id = 1, Keyword = "SALARY", Type = "Income", Category = "Work", KeywordLength = 6 };
        await _dbContext.CategoryRules.AddAsync(rule);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _service.CategorizeAsync("SALARY PAYMENT", "Expense");

        // Assert
        Assert.Equal("Untracked Category", result);
    }

    [Fact]
    public async Task GetAllAsync_ReturnsAllRulesOrderedByKeywordLength()
    {
        // Arrange
        var rules = new List<CategoryRule>
        {
            new CategoryRule { Id = 1, Keyword = "GAS", Type = "Expense", Category = "Transportation", KeywordLength = 3 },
            new CategoryRule { Id = 2, Keyword = "GROCERY STORE", Type = "Expense", Category = "Food", KeywordLength = 12 }
        };
        
        await _dbContext.CategoryRules.AddRangeAsync(rules);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _service.GetAllAsync();

        // Assert
        Assert.Equal(2, result.Count);
        Assert.Equal("GROCERY STORE", result[0].Keyword);
        Assert.Equal("GAS", result[1].Keyword);
    }

    [Fact]
    public async Task GetByIdAsync_WithExistingId_ReturnsRule()
    {
        // Arrange
        var rule = new CategoryRule { Id = 1, Keyword = "GROCERY", Type = "Expense", Category = "Food", KeywordLength = 7 };
        await _dbContext.CategoryRules.AddAsync(rule);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _service.GetByIdAsync(1);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("GROCERY", result.Keyword);
        Assert.Equal("Food", result.Category);
    }

    [Fact]
    public async Task GetByIdAsync_WithNonExistingId_ReturnsNull()
    {
        // Act
        var result = await _service.GetByIdAsync(999);

        // Assert
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
            Category = "Test Category",
            KeywordLength = 4
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
            Category = "Updated Category",
            KeywordLength = 7
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

    public void Dispose()
    {
        _dbContext.Dispose();
    }
}