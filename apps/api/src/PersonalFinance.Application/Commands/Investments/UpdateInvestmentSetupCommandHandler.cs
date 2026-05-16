using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Commands.Investments;

public class UpdateInvestmentSetupCommandHandler(
    Supabase.Client supabase,
    IValidator<UpdateInvestmentSetupCommand> validator,
    ILogger<UpdateInvestmentSetupCommandHandler> logger
) : IRequestHandler<UpdateInvestmentSetupCommand, InvestmentSetup?>
{
    public async Task<InvestmentSetup?> Handle(UpdateInvestmentSetupCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Updating investment setup: {Id}", request.Id);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var result = await supabase.From<InvestmentSetup>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Set(x => x.Name, request.Name)
            .Set(x => x.ArchetypeId, request.ArchetypeId)
            .Set(x => x.BaseCurrency, request.BaseCurrency)
            .Set(x => x.UpdatedAt, DateTime.UtcNow)
            .Update();

        var updated = result.Models.FirstOrDefault();
        if (updated is null) return null;
        logger.LogInformation("Investment setup updated: {Id}", updated.Id);
        return updated;
    }
}
