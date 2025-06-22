using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands
{
    public record CreateCategoryRuleCommand(CategoryRule CategoryRule) : IRequest<CategoryRule>;
}