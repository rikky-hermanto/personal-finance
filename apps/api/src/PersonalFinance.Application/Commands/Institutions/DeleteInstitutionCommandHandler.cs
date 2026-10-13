using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Institutions;
using PersonalFinance.Application.Interfaces;

public class DeleteInstitutionCommandHandler(
    ILogger<DeleteInstitutionCommandHandler> logger,
    ICashflowMutationService mutations
) : IRequestHandler<DeleteInstitutionCommand, bool>
{
    public async Task<bool> Handle(DeleteInstitutionCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Deleting institution: {Id}", request.Id);

        if (!await mutations.DeleteInstitutionAsync(request.Id, cancellationToken))
        {
            logger.LogWarning("Institution {Id} not found", request.Id);
            return false;
        }
        logger.LogInformation("Institution {Id} deleted", request.Id);
        return true;
    }
}
