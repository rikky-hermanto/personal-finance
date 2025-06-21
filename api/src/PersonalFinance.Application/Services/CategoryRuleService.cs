using Microsoft.EntityFrameworkCore;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Persistence;
using System.Collections.Generic;
using System.Threading.Tasks;

public class CategoryRuleService : ICategoryRuleService
{
    private readonly AppDbContext _dbContext;

    public CategoryRuleService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<string> CategorizeAsync(string description, string type)
    {
        var rules = await _dbContext.CategoryRules
            .Where(r => r.Type.Equals(type, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(r => r.KeywordLength)
            .ToListAsync();

        foreach (var rule in rules)
        {
            if (description.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
                return rule.Category;
        }
        return "Untracked Category";
    }

    public async Task<List<CategoryRule>> GetAllAsync()
    {
        return await _dbContext.CategoryRules
            .OrderByDescending(r => r.KeywordLength)
            .ToListAsync();
    }

    public async Task<CategoryRule?> GetByIdAsync(int id)
    {
        return await _dbContext.CategoryRules.FindAsync(id);
    }

    public async Task<CategoryRule> AddAsync(CategoryRule rule)
    {
        rule.KeywordLength = rule.Keyword.Length;
        _dbContext.CategoryRules.Add(rule);
        await _dbContext.SaveChangesAsync();
        return rule;
    }

    public async Task<CategoryRule?> UpdateAsync(int id, CategoryRule rule)
    {
        var existing = await _dbContext.CategoryRules.FindAsync(id);
        if (existing == null) return null;
        existing.Keyword = rule.Keyword;
        existing.Type = rule.Type;
        existing.Category = rule.Category;
        existing.KeywordLength = rule.Keyword.Length;
        await _dbContext.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var rule = await _dbContext.CategoryRules.FindAsync(id);
        if (rule == null) return false;
        _dbContext.CategoryRules.Remove(rule);
        await _dbContext.SaveChangesAsync();
        return true;
    }
}