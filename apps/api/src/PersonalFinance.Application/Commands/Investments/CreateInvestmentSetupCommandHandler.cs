using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Investments;

public class CreateInvestmentSetupCommandHandler(
    Supabase.Client supabase,
    IValidator<CreateInvestmentSetupCommand> validator,
    ILogger<CreateInvestmentSetupCommandHandler> logger
) : IRequestHandler<CreateInvestmentSetupCommand, InvestmentSetup>
{
    public async Task<InvestmentSetup> Handle(CreateInvestmentSetupCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Creating investment setup: {Name}", request.Name);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var entity = new InvestmentSetup
        {
            Id = Guid.NewGuid(),
            UserId = Guid.Empty,
            Name = request.Name,
            ArchetypeId = request.ArchetypeId,
            BaseCurrency = request.BaseCurrency,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        var result = await supabase.From<InvestmentSetup>().Insert(entity);
        var inserted = result.Models.First();
        logger.LogInformation("Investment setup created with ID: {Id}", inserted.Id);
        return inserted;
    }
}
