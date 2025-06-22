using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands
{
    public record UpdateCategoryRuleCommand(int Id, CategoryRule Rule) : IRequest<CategoryRule?>;
}