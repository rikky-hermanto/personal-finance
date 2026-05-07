using MediatR;

namespace PersonalFinance.Application.Commands
{
    public record DeleteAllCategoryRulesCommand : IRequest<int>;
}
