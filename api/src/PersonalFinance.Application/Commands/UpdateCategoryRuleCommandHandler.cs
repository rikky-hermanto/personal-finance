using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Persistence;

public class UpdateCategoryRuleCommandHandler : IRequestHandler<UpdateCategoryRuleCommand, CategoryRule?>
{
    private readonly AppDbContext _dbContext;

    public UpdateCategoryRuleCommandHandler(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<CategoryRule?> Handle(UpdateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        var existing = await _dbContext.CategoryRules.FindAsync(new object[] { request.Id }, cancellationToken);
        if (existing == null) return null;

        existing.Keyword = request.Rule.Keyword;
        existing.Type = request.Rule.Type;
        existing.Category = request.Rule.Category;
        existing.KeywordLength = request.Rule.Keyword.Length;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return existing;
    }
}