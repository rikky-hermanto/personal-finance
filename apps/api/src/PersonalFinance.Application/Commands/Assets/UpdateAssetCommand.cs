using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Assets;

public record UpdateAssetCommand(
    Guid Id,
    string Name,
    string AssetClass,
    string Currency,
    string ValuationStrategy,
    string? Metadata
) : IRequest<Asset?>;
