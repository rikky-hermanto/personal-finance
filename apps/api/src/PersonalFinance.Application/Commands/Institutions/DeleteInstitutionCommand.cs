using MediatR;

namespace PersonalFinance.Application.Commands.Institutions;

public record DeleteInstitutionCommand(Guid Id) : IRequest<bool>;
