using FluentValidation;
using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using Microsoft.Extensions.Logging;

public class CreateCategoryRuleCommandHandler : IRequestHandler<CreateCategoryRuleCommand, CategoryRule>
{
    private readonly Supabase.Client _supabase;
    private readonly IValidator<CreateCategoryRuleCommand> _validator;
    private readonly IMediator _mediator;
    private readonly ILogger<CreateCategoryRuleCommandHandler> _logger;

    public CreateCategoryRuleCommandHandler(Supabase.Client supabase, IMediator mediator, IValidator<CreateCategoryRuleCommand> validator, ILogger<CreateCategoryRuleCommandHandler> logger)
    {
        _supabase = supabase;
        _validator = validator;
        _mediator = mediator;
        _logger = logger;
    }

    public async Task<CategoryRule> Handle(CreateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        _logger.LogDebug("Creating new category rule.");
        await _validator.ValidateAndThrowAsync(request, cancellationToken);

        var result = await _supabase.From<CategoryRule>().Insert(request.CategoryRule);
        var inserted = result.Models.First();
        _logger.LogInformation("Category rule created with ID: {Id}", inserted.Id);

        await _mediator.Publish(new CategoryRuleCreatedEvent(inserted), cancellationToken);
        return inserted;
    }
}
