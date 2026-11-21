using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Goals;

/// <summary>Deletes a goal; the composite FKs cascade to its contributions and cost items.</summary>
public record DeleteGoalCommand(Guid Id) : IRequest<bool>;

public class DeleteGoalCommandHandler(
    IGoalService goals,
    ILogger<DeleteGoalCommandHandler> logger
) : IRequestHandler<DeleteGoalCommand, bool>
{
    public async Task<bool> Handle(DeleteGoalCommand request, CancellationToken ct)
    {
        var deleted = await goals.DeleteAsync(request.Id, ct);
        logger.LogInformation("Delete goal {Id}: {Result}", request.Id, deleted ? "deleted" : "not found");
        return deleted;
    }
}
