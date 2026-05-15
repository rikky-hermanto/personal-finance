using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Holdings;

public record UpdateHoldingCommand(
    Guid Id,
    decimal Quantity,
    decimal CostBasis
) : IRequest<Holding?>;
