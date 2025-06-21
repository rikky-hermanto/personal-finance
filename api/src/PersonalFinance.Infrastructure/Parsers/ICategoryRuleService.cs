using PersonalFinance.Domain.Entities;

public interface ICategoryRuleService
{
    Task<string> CategorizeAsync(string description, string type);

    Task<List<CategoryRule>> GetAllAsync();
    Task<CategoryRule?> GetByIdAsync(int id);
    Task<CategoryRule> AddAsync(CategoryRule rule);
    Task<CategoryRule?> UpdateAsync(int id, CategoryRule rule);
    Task<bool> DeleteAsync(int id);
}