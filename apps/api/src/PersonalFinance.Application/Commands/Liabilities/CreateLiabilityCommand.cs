using MediatR;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Liabilities;

public record CreateLiabilityCommand(
    string Name,
    string LiabilityType,
    decimal Principal,
    DateOnly StartDate,
    Guid? AccountId = null,
    Guid? AssetId = null,
    decimal? InterestRate = null,
    DateOnly? EndDate = null,
    decimal? MonthlyPayment = null
) : IRequest<Liability>, IAffectsJourney;
