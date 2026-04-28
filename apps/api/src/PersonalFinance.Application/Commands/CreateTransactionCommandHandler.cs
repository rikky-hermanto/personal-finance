using FluentValidation;
using MediatR;
using PersonalFinance.Domain.Entities;

public class CreateTransactionCommandHandler : IRequestHandler<CreateTransactionCommand, Transaction>
{
    private readonly Supabase.Client _supabase;
    private readonly IMediator _mediator;
    private readonly IValidator<CreateTransactionCommand> _validator;

    public CreateTransactionCommandHandler(Supabase.Client supabase, IMediator mediator, IValidator<CreateTransactionCommand> validator)
    {
        _supabase = supabase;
        _mediator = mediator;
        _validator = validator;
    }

    public async Task<Transaction> Handle(CreateTransactionCommand request, CancellationToken cancellationToken)
    {
        await _validator.ValidateAndThrowAsync(request, cancellationToken);

        var result = await _supabase.From<Transaction>().Insert(request.Transaction);
        var inserted = result.Models.First();

        await _mediator.Publish(new TransactionCreatedEvent(inserted), cancellationToken);
        return inserted;
    }
}
