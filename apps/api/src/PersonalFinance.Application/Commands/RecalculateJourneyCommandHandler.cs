using MediatR;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

public class RecalculateJourneyCommandHandler(IJourneyScoringService service)
    : IRequestHandler<RecalculateJourneyCommand, JourneyStateDto>
{
    public Task<JourneyStateDto> Handle(RecalculateJourneyCommand request, CancellationToken ct)
        => service.RecalculateAsync(request.UserId, ct);
}
