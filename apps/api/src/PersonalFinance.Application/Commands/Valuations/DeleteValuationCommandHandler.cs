using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Valuations;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class DeleteValuationCommandHandler(
    Supabase.Client supabase,
    ILogger<DeleteValuationCommandHandler> logger
) : IRequestHandler<DeleteValuationCommand, bool>
{
    public async Task<bool> Handle(DeleteValuationCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Deleting valuation: {Id}", request.Id);

        var existing = await supabase.From<Valuation>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Valuation {Id} not found", request.Id);
            return false;
        }

        await supabase.From<Valuation>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();

        logger.LogInformation("Valuation {Id} deleted", request.Id);
        return true;
    }
}
