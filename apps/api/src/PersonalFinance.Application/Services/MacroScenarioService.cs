using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Services;

public class MacroScenarioService(
    Supabase.Client supabase,
    ILogger<MacroScenarioService> logger
) : IMacroScenarioService
{
    public async Task<IReadOnlyList<MacroScenario>> GetAllAsync(CancellationToken ct = default)
    {
        var result = await supabase.From<MacroScenario>()
            .Order("created_at", Ordering.Descending)
            .Get(ct);

        logger.LogDebug("Fetched {Count} saved macro scenarios", result.Models.Count);
        return result.Models;
    }
}
