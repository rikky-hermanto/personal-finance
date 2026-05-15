using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Accounts;

public record CreateAccountCommand(
    Guid? InstitutionId,
    string Name,
    string AccountType,
    string Currency,
    decimal OpeningBalance,
    DateOnly OpeningDate,
    string? Color = null,
    string? Icon = null
) : IRequest<Account>;
