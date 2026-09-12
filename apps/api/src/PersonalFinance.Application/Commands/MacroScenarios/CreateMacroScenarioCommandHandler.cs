using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.MacroScenarios;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Domain.Events;

public class CreateMacroScenarioCommandHandler(
    Supabase.Client supabase,
    IValidator<CreateMacroScenarioCommand> validator,
    IMediator mediator,
    ILogger<CreateMacroScenarioCommandHandler> logger
) : IRequestHandler<CreateMacroScenarioCommand, MacroScenario>
{
    public async Task<MacroScenario> Handle(CreateMacroScenarioCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Saving macro scenario: {Name}", request.Name);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var entity = new MacroScenario
        {
            Id = Guid.NewGuid(),
            UserId = Guid.Empty, // PF-S08 will replace with JWT user_id
            Name = request.Name,
            DriversJson = request.DriversJson,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        var result = await supabase.From<MacroScenario>().Insert(entity);
        var inserted = result.Models.First();

        await mediator.Publish(new MacroScenarioCreatedEvent(inserted), cancellationToken);

        logger.LogInformation("Macro scenario saved with ID: {Id}", inserted.Id);
        return inserted;
    }
}
