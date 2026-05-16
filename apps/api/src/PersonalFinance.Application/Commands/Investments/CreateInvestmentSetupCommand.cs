using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Investments;

public record CreateInvestmentSetupCommand(
    string Name,
    string ArchetypeId,
    string BaseCurrency = "IDR"
) : IRequest<InvestmentSetup>;
