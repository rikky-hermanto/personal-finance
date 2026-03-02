using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface ICategoryRuleService
{
    Task<string> CategorizeAsync(string description, string type);

    Task<List<CategoryRuleDto>> GetAllAsync();
    Task<CategoryRuleDto?> GetByIdAsync(int id);
    Task<CategoryRuleDto> AddAsync(CategoryRuleDto rule);
    Task<CategoryRuleDto?> UpdateAsync(int id, CategoryRuleDto rule);
    Task<bool> DeleteAsync(int id);
}
