using System.Threading;
using System.Threading.Tasks;
using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Infrastructure.Parsers;

public class CreateCategoryRuleCommandHandler : IRequestHandler<CreateCategoryRuleCommand, CategoryRule>
{
    private readonly ICategoryRuleService _categoryRuleService;

    public CreateCategoryRuleCommandHandler(ICategoryRuleService categoryRuleService)
    {
        _categoryRuleService = categoryRuleService;
    }

    public async Task<CategoryRule> Handle(CreateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        // Optionally, you could check for duplicates here if needed.
        // The service will set KeywordLength automatically.
        var createdRule = await _categoryRuleService.AddAsync(request.Rule);
        return createdRule;
    }
}