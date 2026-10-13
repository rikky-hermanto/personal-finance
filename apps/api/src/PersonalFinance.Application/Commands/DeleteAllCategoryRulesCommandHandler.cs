using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Interfaces;

public class DeleteAllCategoryRulesCommandHandler : IRequestHandler<DeleteAllCategoryRulesCommand, int>
{
    private readonly ILogger<DeleteAllCategoryRulesCommandHandler> _logger;
    private readonly ICashflowMutationService _mutations;

    public DeleteAllCategoryRulesCommandHandler(ILogger<DeleteAllCategoryRulesCommandHandler> logger, ICashflowMutationService mutations)
    {
        _logger = logger;
        _mutations = mutations;
    }

    public async Task<int> Handle(DeleteAllCategoryRulesCommand request, CancellationToken cancellationToken)
    {
        var deleted = await _mutations.ResetRulesAsync(cancellationToken);
        _logger.LogWarning("Deleted all category rules via reset command.");
        return deleted;
    }
}
