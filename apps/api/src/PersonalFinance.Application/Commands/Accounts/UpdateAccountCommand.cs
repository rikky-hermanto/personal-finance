using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Accounts;

public record UpdateAccountCommand(
    Guid Id,
    string Name,
    string AccountType,
    string Currency,
    bool IsActive,
    string? Color,
    string? Icon
) : IRequest<Account?>;
