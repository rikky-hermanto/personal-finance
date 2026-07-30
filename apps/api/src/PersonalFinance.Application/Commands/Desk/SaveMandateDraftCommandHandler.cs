using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos.Desk;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Desk;

public class SaveMandateDraftCommandHandler(
    IDeskMandateService mandateService,
    IValidator<SaveMandateDraftCommand> validator,
    ILogger<SaveMandateDraftCommandHandler> logger
) : IRequestHandler<SaveMandateDraftCommand, DeskMandateVersionDto>
{
    public async Task<DeskMandateVersionDto> Handle(SaveMandateDraftCommand request, CancellationToken cancellationToken)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        logger.LogDebug("Saving desk mandate draft (preset: {Preset})", request.Preset);
        return await mandateService.SaveDraftAsync(request.Params, request.Preset, request.EffectiveDate, request.ChangeReason);
    }
}
