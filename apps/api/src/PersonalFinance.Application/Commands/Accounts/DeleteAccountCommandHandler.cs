using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class DeleteAccountCommandHandler(
    Supabase.Client supabase,
    ILogger<DeleteAccountCommandHandler> logger
) : IRequestHandler<DeleteAccountCommand, bool>
{
    public async Task<bool> Handle(DeleteAccountCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Deleting account: {Id}", request.Id);

        var existing = await supabase.From<Account>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Account {Id} not found", request.Id);
            return false;
        }

        await supabase.From<Account>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();

        logger.LogInformation("Account {Id} deleted", request.Id);
        return true;
    }
}
