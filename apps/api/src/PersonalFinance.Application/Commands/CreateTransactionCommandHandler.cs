using MediatR;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Persistence;
using FluentValidation;

public class CreateTransactionCommandHandler : IRequestHandler<CreateTransactionCommand, Transaction>
{
    private readonly AppDbContext _dbContext;
    private readonly IMediator _mediator;
    private readonly IValidator<CreateTransactionCommand> _validator;

    public CreateTransactionCommandHandler(AppDbContext dbContext, IMediator mediator, IValidator<CreateTransactionCommand> validator)
    {
        _dbContext = dbContext;
        _mediator = mediator;
        _validator = validator;
    }

    public async Task<Transaction> Handle(CreateTransactionCommand request, CancellationToken cancellationToken)
    {
        // FluentValidation
        await _validator.ValidateAndThrowAsync(request, cancellationToken);

        var t = request.Transaction;

        await _dbContext.Transactions.AddAsync(t, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _mediator.Publish(new TransactionCreatedEvent(t), cancellationToken);

        return t;
    }
}