using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

public class RecalculateJourneyCommandHandler(
    IJourneyScoringService service,
    IQuestEngine engine,
    ILogger<RecalculateJourneyCommandHandler> logger)
    : IRequestHandler<RecalculateJourneyCommand, JourneyStateDto>
{
    public async Task<JourneyStateDto> Handle(RecalculateJourneyCommand request, CancellationToken ct)
    {
        var result = await service.RecalculateWithSnapshotAsync(request.UserId, ct);
        try
        {
            await engine.EvaluateAsync(request.UserId, result.Snapshot, ct);
        }
        catch (Exception ex)
        {
            // Scores are the product's truth and are already saved; a quest failure must not hide them.
            logger.LogError(ex, "Quest evaluation failed for user {UserId}", request.UserId);
        }
        return result.State;
    }
}
