using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class UpdateAccountCommandHandler(
    Supabase.Client supabase,
    ILogger<UpdateAccountCommandHandler> logger
) : IRequestHandler<UpdateAccountCommand, Account?>
{
    public async Task<Account?> Handle(UpdateAccountCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Updating account: {Id}", request.Id);

        var existing = await supabase.From<Account>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Account {Id} not found", request.Id);
            return null;
        }

        await supabase.From<Account>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Set(x => x.Name, request.Name)
            .Set(x => x.AccountType, request.AccountType)
            .Set(x => x.Currency, request.Currency)
            .Set(x => x.IsActive, request.IsActive)
            .Set(x => x.Color, request.Color)
            .Set(x => x.Icon, request.Icon)
            .Set(x => x.UpdatedAt, DateTime.UtcNow)
            .Update();

        existing.Name = request.Name;
        existing.AccountType = request.AccountType;
        existing.Currency = request.Currency;
        existing.IsActive = request.IsActive;
        existing.Color = request.Color;
        existing.Icon = request.Icon;
        return existing;
    }
}
