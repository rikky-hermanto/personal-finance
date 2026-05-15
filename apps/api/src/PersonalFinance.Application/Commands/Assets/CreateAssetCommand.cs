using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Assets;

public record CreateAssetCommand(
    string Name,
    string AssetClass,
    Guid? AccountId,
    DateOnly? AcquiredDate,
    decimal? AcquisitionCost,
    string Currency,
    string ValuationStrategy = "Manual",
    string? Metadata = null
) : IRequest<Asset>;
