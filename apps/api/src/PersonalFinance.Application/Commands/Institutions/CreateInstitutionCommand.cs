using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Institutions;

public record CreateInstitutionCommand(
    string Name,
    string Type,
    string Country = "ID",
    string? LogoUrl = null
) : IRequest<Institution>;
