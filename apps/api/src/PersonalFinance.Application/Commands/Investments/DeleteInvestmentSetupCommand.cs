using MediatR;

namespace PersonalFinance.Application.Commands.Investments;

public record DeleteInvestmentSetupCommand(Guid Id) : IRequest<bool>;
