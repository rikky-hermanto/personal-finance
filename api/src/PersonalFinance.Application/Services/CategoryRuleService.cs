using Microsoft.EntityFrameworkCore;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Persistence;
using MediatR;
using PersonalFinance.Application.Commands;

public class CategoryRuleService : ICategoryRuleService
{
    private readonly AppDbContext _dbContext;
    private readonly IMediator _mediator;

    public CategoryRuleService(AppDbContext dbContext, IMediator mediator)
    {
        _dbContext = dbContext;
        _mediator = mediator;
    }

    public async Task<string> CategorizeAsync(string description, string type)
    {
        var rules = await _dbContext.CategoryRules
            .Where(r => r.Type.ToLower() == type.ToLower())
            .OrderByDescending(r => r.KeywordLength)
            .ToListAsync();

        foreach (var rule in rules)
        {
            if (description.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
                return rule.Category;
        }

        return "Untracked Category";
    }

    public async Task<List<CategoryRuleDto>> GetAllAsync()
    {
        var rules = await _dbContext.CategoryRules
            .OrderByDescending(r => r.KeywordLength)
            .ToListAsync();
        return rules.Select(MapToDto).ToList();
    }

    public async Task<CategoryRuleDto?> GetByIdAsync(int id)
    {
        var rule = await _dbContext.CategoryRules.FindAsync(id);
        return rule == null ? null : MapToDto(rule);
    }

    public async Task<CategoryRuleDto> AddAsync(CategoryRuleDto ruleDto)
    {
        var rule = MapToEntity(ruleDto);
        var created = await _mediator.Send(new CreateCategoryRuleCommand(rule));
        return MapToDto(created);
    }

    public async Task<CategoryRuleDto?> UpdateAsync(int id, CategoryRuleDto ruleDto)
    {
        var rule = MapToEntity(ruleDto);
        var updated = await _mediator.Send(new UpdateCategoryRuleCommand(id, rule));
        return updated == null ? null : MapToDto(updated);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        return await _mediator.Send(new DeleteCategoryRuleCommand(id));
    }

    private static CategoryRuleDto MapToDto(CategoryRule entity)
    {
        return new CategoryRuleDto
        {
            Id = entity.Id,
            Keyword = entity.Keyword,
            Type = entity.Type,
            Category = entity.Category,
            KeywordLength = entity.KeywordLength
        };
    }

    private static CategoryRule MapToEntity(CategoryRuleDto dto)
    {
        return new CategoryRule
        {
            Id = dto.Id,
            Keyword = dto.Keyword,
            Type = dto.Type,
            Category = dto.Category,
            KeywordLength = dto.KeywordLength
        };
    }
}