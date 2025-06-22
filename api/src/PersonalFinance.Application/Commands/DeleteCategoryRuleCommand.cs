using MediatR;

namespace PersonalFinance.Application.Commands
{
    public record DeleteCategoryRuleCommand(int Id) : IRequest<bool>;
}