using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Application.Interfaces;

public class DeleteAccountCommandHandler(
    ILogger<DeleteAccountCommandHandler> logger,
    ICashflowMutationService mutations
) : IRequestHandler<DeleteAccountCommand, bool>
{
    public async Task<bool> Handle(DeleteAccountCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Deleting account: {Id}", request.Id);

        if (!await mutations.DeleteAccountAsync(request.Id, cancellationToken))
        {
            logger.LogWarning("Account {Id} not found", request.Id);
            return false;
        }
        logger.LogInformation("Account {Id} deleted", request.Id);
        return true;
    }
}
