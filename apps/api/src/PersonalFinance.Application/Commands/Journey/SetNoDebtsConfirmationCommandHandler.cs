using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Journey;

public class SetNoDebtsConfirmationCommandHandler(
    IJourneyConfirmationService confirmation,
    IMediator mediator,
    ILogger<SetNoDebtsConfirmationCommandHandler> logger
) : IRequestHandler<SetNoDebtsConfirmationCommand, NoDebtsConfirmationDto>
{
    public async Task<NoDebtsConfirmationDto> Handle(SetNoDebtsConfirmationCommand request, CancellationToken ct)
    {
        DateTime? confirmedAt = request.Confirmed ? DateTime.UtcNow : null;

        await confirmation.SetNoDebtsConfirmedAtAsync(request.UserId, confirmedAt, ct);
        logger.LogInformation("Recalculating journey after no-debts confirmation change for {UserId}", request.UserId);

        // The score must reflect the change before the caller sees the response.
        await mediator.Send(new RecalculateJourneyCommand(request.UserId), ct);

        return new NoDebtsConfirmationDto(confirmedAt);
    }
}
