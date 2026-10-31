using MediatR;

namespace PersonalFinance.Application.Commands.Harvest;

public record MarkHarvestSeenCommand(IReadOnlyList<long> Ids, string? Month) : IRequest<Unit>;
