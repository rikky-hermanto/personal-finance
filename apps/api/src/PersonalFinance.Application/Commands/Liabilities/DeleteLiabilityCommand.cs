using MediatR;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Liabilities;

public record DeleteLiabilityCommand(Guid Id) : IRequest<bool>, IAffectsJourney;
