using FluentValidation;
using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;

public class CreateCategoryRuleCommandHandler : IRequestHandler<CreateCategoryRuleCommand, CategoryRule>
{
    private readonly Supabase.Client _supabase;
    private readonly IValidator<CreateCategoryRuleCommand> _validator;
    private readonly IMediator _mediator;

    public CreateCategoryRuleCommandHandler(Supabase.Client supabase, IMediator mediator, IValidator<CreateCategoryRuleCommand> validator)
    {
        _supabase = supabase;
        _validator = validator;
        _mediator = mediator;
    }

    public async Task<CategoryRule> Handle(CreateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        await _validator.ValidateAndThrowAsync(request, cancellationToken);

        var result = await _supabase.From<CategoryRule>().Insert(request.CategoryRule);
        var inserted = result.Models.First();

        await _mediator.Publish(new CategoryRuleCreatedEvent(inserted), cancellationToken);
        return inserted;
    }
}
