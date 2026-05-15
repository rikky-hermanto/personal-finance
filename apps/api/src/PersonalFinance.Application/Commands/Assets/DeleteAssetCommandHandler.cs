using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Assets;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class DeleteAssetCommandHandler(
    Supabase.Client supabase,
    ILogger<DeleteAssetCommandHandler> logger
) : IRequestHandler<DeleteAssetCommand, bool>
{
    public async Task<bool> Handle(DeleteAssetCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Deleting asset: {Id}", request.Id);

        var existing = await supabase.From<Asset>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Asset {Id} not found", request.Id);
            return false;
        }

        await supabase.From<Asset>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();

        logger.LogInformation("Asset {Id} deleted", request.Id);
        return true;
    }
}
