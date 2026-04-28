using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class UpdateCategoryRuleCommandHandler : IRequestHandler<UpdateCategoryRuleCommand, CategoryRule?>
{
    private readonly Supabase.Client _supabase;

    public UpdateCategoryRuleCommandHandler(Supabase.Client supabase)
    {
        _supabase = supabase;
    }

    public async Task<CategoryRule?> Handle(UpdateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        var existing = await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();
        if (existing == null) return null;

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
        return existing;
    }
}
