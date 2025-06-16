using FluentValidation;
using PersonalFinance.Domain.Entities;

public class CreateTransactionCommandValidator : AbstractValidator<CreateTransactionCommand>
{
    public CreateTransactionCommandValidator()
    {
        RuleFor(x => x.Transaction).NotNull();

        When(x => x.Transaction != null, () =>
        {
            RuleFor(x => x.Transaction.Date)
                .NotEqual(default(DateTime)).WithMessage("Transaction date is required.");

            RuleFor(x => x.Transaction.Description)
                .NotEmpty().WithMessage("Transaction description is required.");

            RuleFor(x => x.Transaction.Flow)
                .NotEmpty().WithMessage("Transaction flow is required.")
                .Must(f => f == "DB" || f == "CR").WithMessage("Transaction flow must be 'DB' or 'CR'.");

            RuleFor(x => x.Transaction.Type)
                .NotEmpty().WithMessage("Transaction type is required.")
                .Must(t => t == "Expense" || t == "Income").WithMessage("Transaction type must be 'Expense' or 'Income'.");

            RuleFor(x => x.Transaction.Wallet)
                .NotEmpty().WithMessage("Transaction wallet is required.");

            RuleFor(x => x.Transaction.AmountIdr)
                .GreaterThanOrEqualTo(0).WithMessage("Transaction amount must be non-negative.");

            RuleFor(x => x.Transaction.Currency)
                .NotEmpty().WithMessage("Transaction currency is required.");
        });
    }
}