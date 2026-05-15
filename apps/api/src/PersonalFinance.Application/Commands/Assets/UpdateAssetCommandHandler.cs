using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Assets;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class UpdateAssetCommandHandler(
    Supabase.Client supabase,
    ILogger<UpdateAssetCommandHandler> logger
) : IRequestHandler<UpdateAssetCommand, Asset?>
{
    public async Task<Asset?> Handle(UpdateAssetCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Updating asset: {Id}", request.Id);

        var existing = await supabase.From<Asset>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Asset {Id} not found", request.Id);
            return null;
        }

        await supabase.From<Asset>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Set(x => x.Name, request.Name)
            .Set(x => x.AssetClass, request.AssetClass)
            .Set(x => x.Currency, request.Currency)
            .Set(x => x.ValuationStrategy, request.ValuationStrategy)
            .Set(x => x.Metadata, request.Metadata)
            .Set(x => x.UpdatedAt, DateTime.UtcNow)
            .Update();

        existing.Name = request.Name;
        existing.AssetClass = request.AssetClass;
        existing.Currency = request.Currency;
        existing.ValuationStrategy = request.ValuationStrategy;
        existing.Metadata = request.Metadata;
        return existing;
    }
}
