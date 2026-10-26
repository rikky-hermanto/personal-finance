using MediatR;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Valuations;

public record DeleteValuationCommand(Guid Id) : IRequest<bool>, IAffectsJourney;
