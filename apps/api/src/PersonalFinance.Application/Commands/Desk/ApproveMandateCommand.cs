using MediatR;
using PersonalFinance.Application.Dtos.Desk;

namespace PersonalFinance.Application.Commands.Desk;

public record ApproveMandateCommand(
    Guid VersionId,
    string ChangeReason,
    bool Reviewed
) : IRequest<DeskMandateVersionDto>;
