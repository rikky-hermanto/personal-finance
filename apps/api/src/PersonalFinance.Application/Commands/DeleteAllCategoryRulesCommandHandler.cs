using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class DeleteAllCategoryRulesCommandHandler : IRequestHandler<DeleteAllCategoryRulesCommand, int>
{
    private readonly Supabase.Client _supabase;
    private readonly ILogger<DeleteAllCategoryRulesCommandHandler> _logger;

    public DeleteAllCategoryRulesCommandHandler(Supabase.Client supabase, ILogger<DeleteAllCategoryRulesCommandHandler> logger)
    {
        _supabase = supabase;
        _logger = logger;
    }

    public async Task<int> Handle(DeleteAllCategoryRulesCommand request, CancellationToken cancellationToken)
    {
        await _supabase.From<CategoryRule>()
            .Filter("id", Operator.GreaterThan, "0")
            .Delete();

        _logger.LogWarning("Deleted all category rules via reset command.");
        return 0; // Return something, we don't have row count from supabase delete easily.
    }
}
