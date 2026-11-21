using System.Text.Json.Serialization;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Goals;

/// <summary>Full update of a goal's editable fields and status. Kind, tier, owner and colour never change.</summary>
public record UpdateGoalCommand(
    Guid Id,
    string Category,
    string Name,
    string? Notes,
    short Priority,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal TargetAmount,
    DateOnly? TargetDate,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal? PriceGrowthRate,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal? PlannedMonthlyInstalment,
    string Status
) : IRequest<GoalDto?>;

public class UpdateGoalCommandHandler(
    IGoalService goals,
    IFoundationCheckService foundation,
    ICurrentUser caller,
    TimeProvider time,
    IValidator<UpdateGoalCommand> validator,
    ILogger<UpdateGoalCommandHandler> logger
) : IRequestHandler<UpdateGoalCommand, GoalDto?>
{
    public async Task<GoalDto?> Handle(UpdateGoalCommand request, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(request, ct);
        var goal = await goals.GetAsync(request.Id, ct);
        if (goal is null) return null;

        var now = time.GetUtcNow().UtcDateTime;
        if (request.Status == "achieved" && goal.Status != "achieved") goal.AchievedAt = now;
        else if (request.Status != "achieved") goal.AchievedAt = null;

        goal.Category = request.Category;
        goal.Name = request.Name.Trim();
        goal.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        goal.Priority = request.Priority;
        goal.TargetAmount = request.TargetAmount;
        goal.TargetDate = request.TargetDate is { } d ? GoalProjection.ToStoredDate(d) : null;
        goal.PriceGrowthRate = request.PriceGrowthRate;
        goal.PlannedMonthlyInstalment = request.PlannedMonthlyInstalment;
        goal.Status = request.Status;
        goal.UpdatedAt = now;

        var saved = await goals.UpdateAsync(goal, ct);
        if (saved is null) return null;
        logger.LogInformation("Goal {Id} updated (status {Status})", saved.Id, saved.Status);
        return await GoalProjection.LoadOneAsync(saved, goals, foundation, caller.UserId, GoalProjection.Today(time), ct);
    }
}
