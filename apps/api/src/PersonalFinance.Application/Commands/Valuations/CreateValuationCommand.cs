using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Valuations;

public record CreateValuationCommand(
    string SubjectType,
    Guid SubjectId,
    decimal ValueNative,
    string Currency,
    DateTime? ValuedAt = null,
    string Source = "manual",
    string? Notes = null
) : IRequest<Valuation>;
