using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Holdings;
using PersonalFinance.Domain.Entities;

public class CreateHoldingCommandHandler(
    Supabase.Client supabase,
    IValidator<CreateHoldingCommand> validator,
    ILogger<CreateHoldingCommandHandler> logger
) : IRequestHandler<CreateHoldingCommand, Holding>
{
    public async Task<Holding> Handle(CreateHoldingCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Creating holding: {Ticker} in account {AccountId}", request.Ticker, request.AccountId);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var entity = new Holding
        {
            Id = Guid.NewGuid(),
            UserId = Guid.Empty, // PF-S08 will replace with JWT user_id
            AccountId = request.AccountId,
            Ticker = request.Ticker,
            Quantity = request.Quantity,
            CostBasis = request.CostBasis,
            Currency = request.Currency,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        var result = await supabase.From<Holding>().Insert(entity);
        var inserted = result.Models.First();
        logger.LogInformation("Holding created with ID: {Id}", inserted.Id);
        return inserted;
    }
}
