using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Application.Interfaces;
using static Supabase.Postgrest.Constants;

public class UpdateAccountCommandHandler(
    Supabase.Client supabase,
    ILogger<UpdateAccountCommandHandler> logger,
    ICurrentUser caller,
    ICashflowMutationService mutations
) : IRequestHandler<UpdateAccountCommand, Account?>
{
    public async Task<Account?> Handle(UpdateAccountCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Updating account: {Id}", request.Id);

        if (!await mutations.UpdateAccountAsync(request, cancellationToken))
        {
            logger.LogWarning("Account {Id} not found", request.Id);
            return null;
        }
        return await supabase.From<Account>()
            .Filter("user_id", Operator.Equals, caller.UserId.ToString())
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();
    }
}
