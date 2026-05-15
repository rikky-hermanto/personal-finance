using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Holdings;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class DeleteHoldingCommandHandler(
    Supabase.Client supabase,
    ILogger<DeleteHoldingCommandHandler> logger
) : IRequestHandler<DeleteHoldingCommand, bool>
{
    public async Task<bool> Handle(DeleteHoldingCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Deleting holding: {Id}", request.Id);

        var existing = await supabase.From<Holding>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Holding {Id} not found", request.Id);
            return false;
        }

        await supabase.From<Holding>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();

        logger.LogInformation("Holding {Id} deleted", request.Id);
        return true;
    }
}
