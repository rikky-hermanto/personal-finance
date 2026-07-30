using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos.Desk;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Desk;

public class ApproveMandateCommandHandler(
    IDeskMandateService mandateService,
    IValidator<ApproveMandateCommand> validator,
    ILogger<ApproveMandateCommandHandler> logger
) : IRequestHandler<ApproveMandateCommand, DeskMandateVersionDto>
{
    public async Task<DeskMandateVersionDto> Handle(ApproveMandateCommand request, CancellationToken cancellationToken)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        logger.LogInformation("Approving desk mandate version {VersionId}", request.VersionId);
        return await mandateService.ApproveAsync(request.VersionId, request.ChangeReason, request.Reviewed);
    }
}
