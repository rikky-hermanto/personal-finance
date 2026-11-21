using System.Text.Json.Serialization;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Goals;

/// <summary>Creates a big_purchase goal. Kind, tier, owner and colour are set server-side, never from the request.
/// Not IAffectsJourney (PF-154 decision 6).</summary>
public record CreateGoalCommand(
    string Category,
    string Name,
    string? Notes,
    short Priority,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal TargetAmount,
    DateOnly? TargetDate,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal? PriceGrowthRate,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal? PlannedMonthlyInstalment
) : IRequest<GoalDto>;

public class CreateGoalCommandHandler(
    IGoalService goals,
    IFoundationCheckService foundation,
    ICurrentUser caller,
    TimeProvider time,
    IValidator<CreateGoalCommand> validator,
    ILogger<CreateGoalCommandHandler> logger
) : IRequestHandler<CreateGoalCommand, GoalDto>
{
    public async Task<GoalDto> Handle(CreateGoalCommand request, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(request, ct);

        var now = time.GetUtcNow().UtcDateTime;
        var goal = new Goal
        {
            UserId = caller.UserId,
            Kind = GoalKinds.BigPurchase,
            Tier = GoalKinds.TierFor[GoalKinds.BigPurchase],
            Category = request.Category,
            Name = request.Name.Trim(),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            Priority = request.Priority,
            Recurrence = "one_off",
            TargetAmount = request.TargetAmount,
            Currency = "IDR",
            TargetDate = request.TargetDate is { } d ? GoalProjection.ToStoredDate(d) : null,
            PriceGrowthRate = request.PriceGrowthRate,
            PlannedMonthlyInstalment = request.PlannedMonthlyInstalment,
            Status = "active",
            ColorIndex = await goals.NextColorIndexAsync(ct),
            UpdatedAt = now,
        };

        var saved = await goals.InsertAsync(goal, ct);
        logger.LogInformation("Goal {Id} created (kind {Kind}, colour {Colour})", saved.Id, saved.Kind, saved.ColorIndex);
        return await GoalProjection.LoadOneAsync(saved, goals, foundation, caller.UserId, GoalProjection.Today(time), ct);
    }
}
