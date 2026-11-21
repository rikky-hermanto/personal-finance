using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Goals;

/// <summary>Replaces a property or vehicle goal's cost breakdown. With any items, the target becomes the cash
/// needed (every line except the loan principal). Amounts only: no tax or fee rate exists anywhere.</summary>
public record ReplaceGoalCostItemsCommand(Guid GoalId, List<GoalCostItemInput> Items) : IRequest<GoalDto>;

public class ReplaceGoalCostItemsCommandHandler(
    IGoalService goals,
    IFoundationCheckService foundation,
    ICurrentUser caller,
    TimeProvider time,
    IValidator<ReplaceGoalCostItemsCommand> validator,
    ILogger<ReplaceGoalCostItemsCommandHandler> logger
) : IRequestHandler<ReplaceGoalCostItemsCommand, GoalDto>
{
    // Source: PF-154 AC "Property and vehicle goals take an optional cost breakdown".
    private static readonly HashSet<string> BreakdownCategories = ["house_land", "vehicle"];

    public async Task<GoalDto> Handle(ReplaceGoalCostItemsCommand request, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(request, ct);
        var goal = await goals.GetAsync(request.GoalId, ct) ?? throw new KeyNotFoundException();

        if (request.Items.Count > 0)
        {
            if (!BreakdownCategories.Contains(goal.Category))
                throw Invalid("Items", "Only house or land and vehicle goals take a cost breakdown.");
            var cash = GoalProjection.CashNeeded(request.Items.Select(i => (i.ItemType, i.Amount)));
            if (cash <= 0m)
                throw Invalid("Items", "The cash you need must be above zero. A loan alone is not cash you save.");
            goal.TargetAmount = cash;
            goal.UpdatedAt = time.GetUtcNow().UtcDateTime;
        }

        var rows = request.Items.Select((i, n) => new GoalCostItem
        {
            UserId = caller.UserId,
            GoalId = goal.Id,
            ItemType = i.ItemType,
            Label = i.Label.Trim(),
            Amount = i.Amount,
            SortOrder = (short)n,
        }).ToList();

        await goals.ReplaceCostItemsAsync(goal.Id, rows, ct);
        var saved = request.Items.Count > 0 ? await goals.UpdateAsync(goal, ct) ?? goal : goal;
        logger.LogInformation("Goal {Id}: {Count} cost lines, target {Target}", goal.Id, rows.Count, saved.TargetAmount);
        return await GoalProjection.LoadOneAsync(saved, goals, foundation, caller.UserId, GoalProjection.Today(time), ct);
    }

    private static ValidationException Invalid(string property, string message) =>
        new([new ValidationFailure(property, message)]);
}
