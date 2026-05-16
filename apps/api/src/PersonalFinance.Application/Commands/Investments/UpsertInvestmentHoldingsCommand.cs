using MediatR;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Investments;

public record UpsertInvestmentHoldingsCommand(
    Guid SetupId,
    List<InvestmentHoldingDto> Holdings
) : IRequest<List<InvestmentHolding>>;
