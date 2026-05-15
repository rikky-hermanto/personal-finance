using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Valuations;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;

public class CreateValuationCommandHandler(
    Supabase.Client supabase,
    IFxRateService fxRateService,
    IValidator<CreateValuationCommand> validator,
    ILogger<CreateValuationCommandHandler> logger
) : IRequestHandler<CreateValuationCommand, Valuation>
{
    public async Task<Valuation> Handle(CreateValuationCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Creating valuation for {SubjectType}:{SubjectId}", request.SubjectType, request.SubjectId);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var rateDate = request.ValuedAt.HasValue
            ? DateOnly.FromDateTime(request.ValuedAt.Value)
            : DateOnly.FromDateTime(DateTime.UtcNow);

        var fxRate = await fxRateService.GetRateToIdrAsync(request.Currency, rateDate, cancellationToken);
        var valueIdr = request.ValueNative * fxRate;

        var entity = new Valuation
        {
            Id = Guid.NewGuid(),
            UserId = Guid.Empty, // PF-S08 will replace with JWT user_id
            SubjectType = request.SubjectType,
            SubjectId = request.SubjectId,
            ValueNative = request.ValueNative,
            Currency = request.Currency,
            FxRateToIdr = fxRate,
            ValueIdr = valueIdr,
            Source = request.Source,
            Notes = request.Notes,
            ValuedAt = request.ValuedAt ?? DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };

        var result = await supabase.From<Valuation>().Insert(entity);
        var inserted = result.Models.First();
        logger.LogInformation("Valuation created with ID: {Id}, value_idr: {ValueIdr}", inserted.Id, inserted.ValueIdr);
        return inserted;
    }
}
