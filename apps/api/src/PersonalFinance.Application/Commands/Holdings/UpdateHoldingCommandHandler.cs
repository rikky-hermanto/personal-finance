using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Holdings;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class UpdateHoldingCommandHandler(
    Supabase.Client supabase,
    ILogger<UpdateHoldingCommandHandler> logger
) : IRequestHandler<UpdateHoldingCommand, Holding?>
{
    public async Task<Holding?> Handle(UpdateHoldingCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Updating holding: {Id}", request.Id);

        var existing = await supabase.From<Holding>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Holding {Id} not found", request.Id);
            return null;
        }

        await supabase.From<Holding>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Set(x => x.Quantity, request.Quantity)
            .Set(x => x.CostBasis, request.CostBasis)
            .Set(x => x.UpdatedAt, DateTime.UtcNow)
            .Update();

        existing.Quantity = request.Quantity;
        existing.CostBasis = request.CostBasis;
        return existing;
    }
}
