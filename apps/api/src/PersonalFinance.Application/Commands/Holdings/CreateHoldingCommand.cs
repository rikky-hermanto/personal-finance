using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Holdings;

public record CreateHoldingCommand(
    Guid AccountId,
    string Ticker,
    decimal Quantity,
    decimal CostBasis,
    string Currency
) : IRequest<Holding>;
