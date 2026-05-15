using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Domain.Entities;

public class CreateAccountCommandHandler(
    Supabase.Client supabase,
    IValidator<CreateAccountCommand> validator,
    ILogger<CreateAccountCommandHandler> logger
) : IRequestHandler<CreateAccountCommand, Account>
{
    public async Task<Account> Handle(CreateAccountCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Creating account: {Name}", request.Name);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var entity = new Account
        {
            Id = Guid.NewGuid(),
            UserId = Guid.Empty, // PF-S08 will replace with JWT user_id
            InstitutionId = request.InstitutionId,
            Name = request.Name,
            AccountType = request.AccountType,
            Currency = request.Currency,
            OpeningBalance = request.OpeningBalance,
            OpeningDate = request.OpeningDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            Color = request.Color,
            Icon = request.Icon,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        var result = await supabase.From<Account>().Insert(entity);
        var inserted = result.Models.First();
        logger.LogInformation("Account created with ID: {Id}", inserted.Id);
        return inserted;
    }
}
