using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos.Desk;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Desk;

public class SetPositionSleeveCommandHandler(
    IDeskService deskService,
    IValidator<SetPositionSleeveCommand> validator,
    ILogger<SetPositionSleeveCommandHandler> logger
) : IRequestHandler<SetPositionSleeveCommand, DeskPositionDto>
{
    public async Task<DeskPositionDto> Handle(SetPositionSleeveCommand request, CancellationToken cancellationToken)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        logger.LogInformation("Setting sleeve for desk position {PositionId}", request.PositionId);
        return await deskService.SetPositionSleeveAsync(request.PositionId, request.Sleeve);
    }
}
