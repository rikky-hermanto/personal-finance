using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Institutions;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class DeleteInstitutionCommandHandler(
    Supabase.Client supabase,
    ILogger<DeleteInstitutionCommandHandler> logger
) : IRequestHandler<DeleteInstitutionCommand, bool>
{
    public async Task<bool> Handle(DeleteInstitutionCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Deleting institution: {Id}", request.Id);

        var existing = await supabase.From<Institution>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Institution {Id} not found", request.Id);
            return false;
        }

        await supabase.From<Institution>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();

        logger.LogInformation("Institution {Id} deleted", request.Id);
        return true;
    }
}
