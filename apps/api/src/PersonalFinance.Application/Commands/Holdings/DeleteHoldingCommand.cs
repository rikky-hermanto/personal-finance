using MediatR;

namespace PersonalFinance.Application.Commands.Holdings;

public record DeleteHoldingCommand(Guid Id) : IRequest<bool>;
