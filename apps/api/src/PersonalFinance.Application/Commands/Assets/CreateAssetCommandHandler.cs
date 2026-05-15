using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Assets;
using PersonalFinance.Domain.Entities;

public class CreateAssetCommandHandler(
    Supabase.Client supabase,
    IValidator<CreateAssetCommand> validator,
    ILogger<CreateAssetCommandHandler> logger
) : IRequestHandler<CreateAssetCommand, Asset>
{
    public async Task<Asset> Handle(CreateAssetCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Creating asset: {Name}", request.Name);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var entity = new Asset
        {
            Id = Guid.NewGuid(),
            UserId = Guid.Empty, // PF-S08 will replace with JWT user_id
            Name = request.Name,
            AssetClass = request.AssetClass,
            AccountId = request.AccountId,
            AcquiredDate = request.AcquiredDate.HasValue
                ? request.AcquiredDate.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)
                : null,
            AcquisitionCost = request.AcquisitionCost,
            Currency = request.Currency,
            ValuationStrategy = request.ValuationStrategy,
            Metadata = request.Metadata,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        var result = await supabase.From<Asset>().Insert(entity);
        var inserted = result.Models.First();
        logger.LogInformation("Asset created with ID: {Id}", inserted.Id);
        return inserted;
    }
}
