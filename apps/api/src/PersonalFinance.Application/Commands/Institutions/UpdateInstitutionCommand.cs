using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Institutions;

public record UpdateInstitutionCommand(
    Guid Id,
    string Name,
    string Type,
    string Country,
    string? LogoUrl
) : IRequest<Institution?>;
