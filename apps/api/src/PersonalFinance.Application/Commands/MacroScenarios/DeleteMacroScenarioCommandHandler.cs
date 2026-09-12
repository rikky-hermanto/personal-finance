using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.MacroScenarios;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class DeleteMacroScenarioCommandHandler(
    Supabase.Client supabase,
    ILogger<DeleteMacroScenarioCommandHandler> logger
) : IRequestHandler<DeleteMacroScenarioCommand, bool>
{
    public async Task<bool> Handle(DeleteMacroScenarioCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Deleting macro scenario: {Id}", request.Id);

        var existing = await supabase.From<MacroScenario>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Macro scenario {Id} not found", request.Id);
            return false;
        }

        await supabase.From<MacroScenario>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();

        logger.LogInformation("Macro scenario {Id} deleted", request.Id);
        return true;
    }
}
