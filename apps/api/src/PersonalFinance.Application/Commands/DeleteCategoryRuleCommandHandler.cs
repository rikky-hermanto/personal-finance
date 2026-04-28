using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class DeleteCategoryRuleCommandHandler : IRequestHandler<DeleteCategoryRuleCommand, bool>
{
    private readonly Supabase.Client _supabase;

    public DeleteCategoryRuleCommandHandler(Supabase.Client supabase)
    {
        _supabase = supabase;
    }

    public async Task<bool> Handle(DeleteCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        var existing = await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();
        if (existing == null) return false;

        await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();
        return true;
    }
}
