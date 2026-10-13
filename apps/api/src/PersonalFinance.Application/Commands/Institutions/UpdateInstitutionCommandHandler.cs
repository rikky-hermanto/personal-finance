using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Institutions;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Application.Interfaces;
using static Supabase.Postgrest.Constants;

public class UpdateInstitutionCommandHandler(
    Supabase.Client supabase,
    ILogger<UpdateInstitutionCommandHandler> logger,
    ICurrentUser caller,
    ICashflowMutationService mutations
) : IRequestHandler<UpdateInstitutionCommand, Institution?>
{
    public async Task<Institution?> Handle(UpdateInstitutionCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Updating institution: {Id}", request.Id);

        if (!await mutations.UpdateInstitutionAsync(request, cancellationToken))
        {
            logger.LogWarning("Institution {Id} not found", request.Id);
            return null;
        }
        return await supabase.From<Institution>()
            .Filter("user_id", Operator.Equals, caller.UserId.ToString())
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();
    }
}
