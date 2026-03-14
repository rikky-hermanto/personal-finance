using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Persistence;

public class CreateCategoryRuleCommandHandler : IRequestHandler<CreateCategoryRuleCommand, CategoryRule>
{
    private readonly AppDbContext _dbContext;
    private readonly IValidator<CreateCategoryRuleCommand> _validator;
    private readonly IMediator _mediator;

    public CreateCategoryRuleCommandHandler(AppDbContext dbContext, IMediator mediator, IValidator<CreateCategoryRuleCommand> validator)
    {
        _dbContext = dbContext;
        _validator = validator;
        _mediator = mediator;
    }

    public async Task<CategoryRule> Handle(CreateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        // FluentValidation
        await _validator.ValidateAndThrowAsync(request, cancellationToken);

        var t = request.CategoryRule;

        await _dbContext.CategoryRules.AddAsync(t, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _mediator.Publish(new CategoryRuleCreatedEvent(t), cancellationToken);
        return t;
    }
}
 