using MediatR;

namespace PersonalFinance.Application.Commands.Liabilities;

public record DeleteLiabilityCommand(Guid Id) : IRequest<bool>;
