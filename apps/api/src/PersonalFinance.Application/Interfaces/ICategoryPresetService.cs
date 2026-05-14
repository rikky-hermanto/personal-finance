using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Interfaces;

public interface ICategoryPresetService
{
    Task<List<CategoryPreset>> GetAllAsync(CancellationToken ct = default);
}
