using MediatR;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Accounts;

public record DeleteAccountCommand(Guid Id) : IRequest<bool>, IAffectsJourney;
