using MediatR;
using PersonalFinance.Application.Commands;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

public class DeleteCategoryRuleCommandHandler : IRequestHandler<DeleteCategoryRuleCommand, bool>
{
    private readonly ILogger<DeleteCategoryRuleCommandHandler> _logger;
    private readonly ICashflowMutationService _mutations;

    public DeleteCategoryRuleCommandHandler(ILogger<DeleteCategoryRuleCommandHandler> logger, ICashflowMutationService mutations)
    {
        _logger = logger;
        _mutations = mutations;
    }

    public async Task<bool> Handle(DeleteCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Deleting category rule with ID: {Id}", request.Id);
        if (!await _mutations.DeleteRuleAsync(request.Id, cancellationToken))
        {
            _logger.LogWarning("Category rule with ID: {Id} not found.", request.Id);
            return false;
        }
        _logger.LogInformation("Category rule with ID: {Id} successfully deleted.", request.Id);
        return true;
    }
}
