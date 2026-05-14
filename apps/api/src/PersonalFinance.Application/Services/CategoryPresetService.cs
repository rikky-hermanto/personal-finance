using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using Supabase;

namespace PersonalFinance.Application.Services;

public class CategoryPresetService(Client supabase) : ICategoryPresetService
{
    public async Task<List<CategoryPreset>> GetAllAsync(CancellationToken ct = default)
    {
        var result = await supabase
            .From<CategoryPreset>()
            .Order("keyword_length", Supabase.Postgrest.Constants.Ordering.Descending)
            .Get(ct);

        return result.Models;
    }
}
