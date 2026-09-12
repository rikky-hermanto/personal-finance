using MediatR;

namespace PersonalFinance.Application.Commands.MacroScenarios;

public record DeleteMacroScenarioCommand(Guid Id) : IRequest<bool>;
