using MediatR;
using PersonalFinance.Domain.Entities;

public class CategoryRuleCreatedEvent : INotification
{
    public CategoryRule CategoryRule { get; }

    public CategoryRuleCreatedEvent(CategoryRule categoryRule)
    {
        CategoryRule = categoryRule;
    }
}