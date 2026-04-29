using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;
using Microsoft.Extensions.Logging;

public class UpdateCategoryRuleCommandHandler : IRequestHandler<UpdateCategoryRuleCommand, CategoryRule?>
{
    private readonly Supabase.Client _supabase;
    private readonly ILogger<UpdateCategoryRuleCommandHandler> _logger;

    public UpdateCategoryRuleCommandHandler(Supabase.Client supabase, ILogger<UpdateCategoryRuleCommandHandler> logger)
    {
        _supabase = supabase;
        _logger = logger;
    }

    public async Task<CategoryRule?> Handle(UpdateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Updating category rule with ID: {Id}", request.Id);
        var existing = await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();
        if (existing == null)
        {
            _logger.LogWarning("Category rule with ID: {Id} not found.", request.Id);
            return null;
        }

        await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Set(x => x.Keyword, request.Rule.Keyword)
            .Set(x => x.Type, request.Rule.Type)
            .Set(x => x.Category, request.Rule.Category)
            .Set(x => x.KeywordLength, request.Rule.Keyword.Length)
            .Update();

        existing.Keyword = request.Rule.Keyword;
        existing.Type = request.Rule.Type;
        existing.Category = request.Rule.Category;
        
        _logger.LogInformation("Category rule with ID: {Id} successfully updated.", request.Id);
        return existing;
    }
}
