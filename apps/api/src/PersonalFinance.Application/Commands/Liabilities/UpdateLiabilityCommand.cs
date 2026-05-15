using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Liabilities;

public record UpdateLiabilityCommand(
    Guid Id,
    string Name,
    string LiabilityType,
    decimal Principal,
    decimal? InterestRate,
    DateOnly? EndDate,
    decimal? MonthlyPayment
) : IRequest<Liability?>;
