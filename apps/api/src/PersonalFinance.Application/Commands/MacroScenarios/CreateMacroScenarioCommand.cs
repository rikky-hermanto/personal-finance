using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.MacroScenarios;

public record CreateMacroScenarioCommand(
    string Name,
    string DriversJson
) : IRequest<MacroScenario>;
