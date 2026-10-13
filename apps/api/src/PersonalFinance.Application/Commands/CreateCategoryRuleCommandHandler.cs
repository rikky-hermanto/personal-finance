using FluentValidation;
using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Dtos;
using static Supabase.Postgrest.Constants;

public class CreateCategoryRuleCommandHandler : IRequestHandler<CreateCategoryRuleCommand, CategoryRule>
{
    private readonly Supabase.Client _supabase;
    private readonly IValidator<CreateCategoryRuleCommand> _validator;
    private readonly IMediator _mediator;
    private readonly ILogger<CreateCategoryRuleCommandHandler> _logger;
    private readonly ICurrentUser _caller;
    private readonly ICashflowMutationService _mutations;

    public CreateCategoryRuleCommandHandler(Supabase.Client supabase, IMediator mediator, IValidator<CreateCategoryRuleCommand> validator, ILogger<CreateCategoryRuleCommandHandler> logger, ICurrentUser caller, ICashflowMutationService mutations)
    {
        _supabase = supabase;
        _validator = validator;
        _mediator = mediator;
        _logger = logger;
        _caller = caller;
        _mutations = mutations;
    }

    public async Task<CategoryRule> Handle(CreateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        _logger.LogDebug("Creating new category rule.");
        await _validator.ValidateAndThrowAsync(request, cancellationToken);
        var result = await _mutations.CreateRuleAsync(new CategoryRuleDto
        {
            Keyword = request.CategoryRule.Keyword,
            Type = request.CategoryRule.Type,
            Category = request.CategoryRule.Category,
            Flow = request.CategoryRule.Flow
        }, cancellationToken);
        var inserted = await _supabase.From<CategoryRule>()
            .Filter("user_id", Operator.Equals, _caller.UserId.ToString())
            .Filter("id", Operator.Equals, result.Id.ToString())
            .Single() ?? throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        _logger.LogInformation("Category rule created with ID: {Id}", inserted.Id);

        if (result.Created)
            await _mediator.Publish(new CategoryRuleCreatedEvent(inserted), cancellationToken);
        return inserted;
    }
}
