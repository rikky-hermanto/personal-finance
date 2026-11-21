using System.Text.Json.Serialization;
using FluentValidation;
using MediatR;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Goals;

/// <summary>Read-only: runs GoalMath on a draft so the forms can preview without browser money math (FIN-01).
/// With only GoalId (+ ContributionAmount), the stored goal's target, date and growth are used.</summary>
public record PreviewGoalQuery(
    Guid? GoalId,
    string? Category,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal? TargetAmount,
    List<GoalCostItemInput>? CostItems,
    DateOnly? TargetDate,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal? PriceGrowthRate,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal? ContributionAmount
) : IRequest<GoalPreviewDto>;

public class PreviewGoalQueryHandler(
    IGoalService goals,
    TimeProvider time
) : IRequestHandler<PreviewGoalQuery, GoalPreviewDto>
{
    public async Task<GoalPreviewDto> Handle(PreviewGoalQuery request, CancellationToken ct)
    {
        var today = GoalProjection.Today(time);
        var goal = request.GoalId is { } id
            ? await goals.GetAsync(id, ct) ?? throw new KeyNotFoundException()
            : null;

        decimal? cashNeeded = null, totalCost = null;
        decimal target;
        DateOnly? date = request.TargetDate;
        decimal? growth = request.PriceGrowthRate;
        if (request.CostItems is { Count: > 0 } items)
        {
            cashNeeded = GoalProjection.CashNeeded(items.Select(i => (i.ItemType, i.Amount)));
            totalCost = items.Sum(i => i.Amount);
            target = cashNeeded.Value;
        }
        else if (request.TargetAmount is { } t) target = t;
        else if (goal is not null)
        {
            target = goal.TargetAmount;
            date = GoalProjection.ToDate(goal.TargetDate);
            growth = goal.PriceGrowthRate;
        }
        else target = 0m;

        var allocated = goal is null
            ? 0m
            : (await goals.ContributionsForAsync([goal.Id], ct)).Sum(c => c.Amount);
        var allocatedAfter = allocated + (request.ContributionAmount ?? 0m);

        // A draft with no amount yet (a breakdown still being typed) has nothing to divide by.
        if (target <= 0m)
            return new GoalPreviewDto
            {
                CashNeeded = cashNeeded, TotalCost = totalCost, Allocated = allocated, AllocatedAfter = allocatedAfter,
                Timeline = "no_target", Overdrawn = allocatedAfter < 0m,
            };

        var after = GoalMath.Compute(target, Math.Max(allocatedAfter, 0m), date, growth, today);
        return new GoalPreviewDto
        {
            CashNeeded = cashNeeded,
            TotalCost = totalCost,
            EffectiveTarget = after.EffectiveTarget,
            Allocated = allocated,
            AllocatedAfter = allocatedAfter,
            PercentAfter = after.PercentComplete,
            Remaining = after.Remaining,
            Surplus = after.Surplus,
            MonthlyNeeded = after.MonthlyNeeded,
            MonthsLeft = after.MonthsLeft,
            Timeline = after.Timeline,
            Overdrawn = allocatedAfter < 0m,
        };
    }
}
