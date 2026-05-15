using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Liabilities;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class DeleteLiabilityCommandHandler(
    Supabase.Client supabase,
    ILogger<DeleteLiabilityCommandHandler> logger
) : IRequestHandler<DeleteLiabilityCommand, bool>
{
    public async Task<bool> Handle(DeleteLiabilityCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Deleting liability: {Id}", request.Id);

        var existing = await supabase.From<Liability>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Liability {Id} not found", request.Id);
            return false;
        }

        await supabase.From<Liability>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();

        logger.LogInformation("Liability {Id} deleted", request.Id);
        return true;
    }
}
