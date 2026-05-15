using MediatR;

namespace PersonalFinance.Application.Commands.Accounts;

public record DeleteAccountCommand(Guid Id) : IRequest<bool>;
