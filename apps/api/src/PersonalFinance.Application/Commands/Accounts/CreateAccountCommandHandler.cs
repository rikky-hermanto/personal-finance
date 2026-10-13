using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Application.Interfaces;
using static Supabase.Postgrest.Constants;
using PersonalFinance.Application.Dtos;

public class CreateAccountCommandHandler(
    Supabase.Client supabase,
    IValidator<CreateAccountCommand> validator,
    ILogger<CreateAccountCommandHandler> logger,
    ICurrentUser caller,
    ICashflowMutationService mutations
) : IRequestHandler<CreateAccountCommand, Account>
{
    public async Task<Account> Handle(CreateAccountCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Creating account: {Name}", request.Name);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var id = await mutations.CreateAccountAsync(request, cancellationToken);
        var inserted = await supabase.From<Account>()
            .Filter("user_id", Operator.Equals, caller.UserId.ToString())
            .Filter("id", Operator.Equals, id.ToString())
            .Single() ?? throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        logger.LogInformation("Account created with ID: {Id}", inserted.Id);
        return inserted;
    }
}
