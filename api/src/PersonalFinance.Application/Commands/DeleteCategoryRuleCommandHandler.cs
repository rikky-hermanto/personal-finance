using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Persistence;
using System.Threading;
using System.Threading.Tasks;

public class DeleteCategoryRuleCommandHandler : IRequestHandler<DeleteCategoryRuleCommand, bool>
{
    private readonly AppDbContext _dbContext;

    public DeleteCategoryRuleCommandHandler(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<bool> Handle(DeleteCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        var rule = await _dbContext.CategoryRules.FindAsync(new object[] { request.Id }, cancellationToken);
        if (rule == null) return false;
        _dbContext.CategoryRules.Remove(rule);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}