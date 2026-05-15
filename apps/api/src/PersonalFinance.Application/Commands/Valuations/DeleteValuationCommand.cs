using MediatR;

namespace PersonalFinance.Application.Commands.Valuations;

public record DeleteValuationCommand(Guid Id) : IRequest<bool>;
