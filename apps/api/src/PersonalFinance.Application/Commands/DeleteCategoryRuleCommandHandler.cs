using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;
using Microsoft.Extensions.Logging;

public class DeleteCategoryRuleCommandHandler : IRequestHandler<DeleteCategoryRuleCommand, bool>
{
    private readonly Supabase.Client _supabase;
    private readonly ILogger<DeleteCategoryRuleCommandHandler> _logger;

    public DeleteCategoryRuleCommandHandler(Supabase.Client supabase, ILogger<DeleteCategoryRuleCommandHandler> logger)
    {
        _supabase = supabase;
        _logger = logger;
    }

    public async Task<bool> Handle(DeleteCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Deleting category rule with ID: {Id}", request.Id);
        var existing = await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();
        if (existing == null)
        {
            _logger.LogWarning("Category rule with ID: {Id} not found.", request.Id);
            return false;
        }

        await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();
        
        _logger.LogInformation("Category rule with ID: {Id} successfully deleted.", request.Id);
        return true;
    }
}
