using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Dtos;

public class UpdateCategoryRuleCommandHandler : IRequestHandler<UpdateCategoryRuleCommand, CategoryRule?>
{
    private readonly Supabase.Client _supabase;
    private readonly ILogger<UpdateCategoryRuleCommandHandler> _logger;
    private readonly ICurrentUser _caller;
    private readonly ICashflowMutationService _mutations;

    public UpdateCategoryRuleCommandHandler(Supabase.Client supabase, ILogger<UpdateCategoryRuleCommandHandler> logger, ICurrentUser caller, ICashflowMutationService mutations)
    {
        _supabase = supabase;
        _logger = logger;
        _caller = caller;
        _mutations = mutations;
    }

    public async Task<CategoryRule?> Handle(UpdateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Updating category rule with ID: {Id}", request.Id);
        if (!await _mutations.UpdateRuleAsync(request.Id, new CategoryRuleDto
            {
                Keyword = request.Rule.Keyword,
                Type = request.Rule.Type,
                Category = request.Rule.Category,
                Flow = request.Rule.Flow
            }, cancellationToken))
        {
            _logger.LogWarning("Category rule with ID: {Id} not found.", request.Id);
            return null;
        }
        _logger.LogInformation("Category rule with ID: {Id} successfully updated.", request.Id);
        return await _supabase.From<CategoryRule>()
            .Filter("user_id", Operator.Equals, _caller.UserId.ToString())
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();
    }
}
