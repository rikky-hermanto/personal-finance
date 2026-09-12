using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Interfaces;

public interface IMacroScenarioService
{
    Task<IReadOnlyList<MacroScenario>> GetAllAsync(CancellationToken ct = default);
}
