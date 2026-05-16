using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Investments;

public record UpdateInvestmentSetupCommand(
    Guid Id,
    string Name,
    string ArchetypeId,
    string BaseCurrency = "IDR"
) : IRequest<InvestmentSetup?>;
