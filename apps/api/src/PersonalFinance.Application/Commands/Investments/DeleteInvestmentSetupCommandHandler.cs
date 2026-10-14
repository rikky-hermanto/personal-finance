using MediatR;
using Microsoft.Extensions.Logging;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Commands.Investments;

public class DeleteInvestmentSetupCommandHandler(
    Supabase.Client supabase,
    ILogger<DeleteInvestmentSetupCommandHandler> logger
) : IRequestHandler<DeleteInvestmentSetupCommand, bool>
{
    public async Task<bool> Handle(DeleteInvestmentSetupCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Deleting investment setup: {Id}", request.Id);

        // RLS hides other owners' setups, so a foreign id reads as not found.
        var existing = await supabase.From<PersonalFinance.Domain.Entities.InvestmentSetup>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Investment setup {Id} not found", request.Id);
            return false;
        }

        // Holdings and snapshots cascade via FK ON DELETE CASCADE
        await supabase.From<PersonalFinance.Domain.Entities.InvestmentSetup>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();

        logger.LogInformation("Investment setup deleted: {Id}", request.Id);
        return true;
    }
}
