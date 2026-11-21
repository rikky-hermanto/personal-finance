using System.Text.Json.Serialization;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Goals;

/// <summary>Records a contribution (positive) or withdrawal (negative). Bookkeeping of an earmark, not new money,
/// so it is not IAffectsJourney (PF-154 decision 6).</summary>
public record AddGoalContributionCommand(
    Guid GoalId,
    [property: JsonNumberHandling(MoneyJson.AsString)] decimal Amount,
    DateOnly ContributedOn,
    Guid? HeldInAccountId,
    string? Note
) : IRequest<GoalContributionDto>;

public record DeleteGoalContributionCommand(Guid GoalId, Guid ContributionId) : IRequest<bool>;

public record GetGoalContributionsQuery(Guid GoalId, int Page = 1, int PageSize = 50)
    : IRequest<PagedResult<GoalContributionDto>>;

internal static class GoalContributionMapping
{
    public static GoalContributionDto ToDto(GoalContribution c) =>
        new(c.Id, c.Amount, DateOnly.FromDateTime(c.ContributedOn), c.HeldInAccountId, c.Note);

    public static ValidationException Invalid(string property, string message) =>
        new([new ValidationFailure(property, message)]);
}

public class AddGoalContributionCommandHandler(
    IGoalService goals,
    ICurrentUser caller,
    IValidator<AddGoalContributionCommand> validator,
    ILogger<AddGoalContributionCommandHandler> logger
) : IRequestHandler<AddGoalContributionCommand, GoalContributionDto>
{
    public async Task<GoalContributionDto> Handle(AddGoalContributionCommand request, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(request, ct);
        var goal = await goals.GetAsync(request.GoalId, ct) ?? throw new KeyNotFoundException();

        // RLS hides another owner's account, so "not visible" means it is not the caller's to use.
        if (request.HeldInAccountId is { } accountId && !await goals.AccountVisibleAsync(accountId, ct))
            throw GoalContributionMapping.Invalid("HeldInAccountId", "That account was not found.");

        if (request.Amount < 0m)
        {
            var allocated = (await goals.ContributionsForAsync([goal.Id], ct)).Sum(c => c.Amount);
            if (allocated + request.Amount < 0m)
                throw GoalContributionMapping.Invalid("Amount", "This withdrawal is more than is set aside for this goal.");
        }

        var saved = await goals.InsertContributionAsync(new GoalContribution
        {
            UserId = caller.UserId,
            GoalId = goal.Id,
            Amount = request.Amount,
            ContributedOn = GoalProjection.ToStoredDate(request.ContributedOn),
            HeldInAccountId = request.HeldInAccountId,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
        }, ct);

        logger.LogInformation("Goal {GoalId}: {Kind} recorded", goal.Id, request.Amount < 0m ? "withdrawal" : "contribution");
        return GoalContributionMapping.ToDto(saved);
    }
}

public class DeleteGoalContributionCommandHandler(
    IGoalService goals,
    ILogger<DeleteGoalContributionCommandHandler> logger
) : IRequestHandler<DeleteGoalContributionCommand, bool>
{
    public async Task<bool> Handle(DeleteGoalContributionCommand request, CancellationToken ct)
    {
        // Allocated must never go below zero, by withdrawal or by removing the deposit a withdrawal relied on.
        var rows = await goals.ContributionsForAsync([request.GoalId], ct);
        var row = rows.FirstOrDefault(c => c.Id == request.ContributionId);
        if (row is null) return false;
        if (rows.Sum(c => c.Amount) - row.Amount < 0m)
            throw GoalContributionMapping.Invalid("ContributionId",
                "Removing this would leave less than zero set aside. Delete the withdrawal first.");

        var deleted = await goals.DeleteContributionAsync(request.GoalId, request.ContributionId, ct);
        logger.LogInformation("Goal {GoalId}: contribution {Id} {Result}", request.GoalId, request.ContributionId,
            deleted ? "deleted" : "not found");
        return deleted;
    }
}

public class GetGoalContributionsQueryHandler(IGoalService goals)
    : IRequestHandler<GetGoalContributionsQuery, PagedResult<GoalContributionDto>>
{
    public async Task<PagedResult<GoalContributionDto>> Handle(GetGoalContributionsQuery request, CancellationToken ct)
    {
        var (items, total) = await goals.ContributionPageAsync(request.GoalId, request.Page, request.PageSize, ct);
        return new PagedResult<GoalContributionDto>
        {
            Items = items.Select(GoalContributionMapping.ToDto).ToList(),
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }
}
