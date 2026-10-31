using System.Globalization;
using FluentValidation;
using MediatR;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Harvest;

public class MarkHarvestSeenCommandHandler(
    IHarvestLedger ledger, IValidator<MarkHarvestSeenCommand> validator)
    : IRequestHandler<MarkHarvestSeenCommand, Unit>
{
    public async Task<Unit> Handle(MarkHarvestSeenCommand request, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(request, ct);
        DateOnly? through = request.Month is null
            ? null
            : DateOnly.ParseExact(request.Month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture);
        await ledger.MarkSeenAsync(request.Ids, through, ct);
        return Unit.Value;
    }
}
