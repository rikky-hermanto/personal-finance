using FluentValidation;
using MediatR;
using PersonalFinance.Domain.Entities;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

public class CreateTransactionCommandHandler : IRequestHandler<CreateTransactionCommand, Transaction>
{
    private readonly Supabase.Client _supabase;
    private readonly IMediator _mediator;
    private readonly IValidator<CreateTransactionCommand> _validator;
    private readonly ILogger<CreateTransactionCommandHandler> _logger;
    private readonly ICurrentUser _caller;

    public CreateTransactionCommandHandler(Supabase.Client supabase, IMediator mediator, IValidator<CreateTransactionCommand> validator, ILogger<CreateTransactionCommandHandler> logger, ICurrentUser caller)
    {
        _supabase = supabase;
        _mediator = mediator;
        _validator = validator;
        _logger = logger;
        _caller = caller;
    }

    public async Task<Transaction> Handle(CreateTransactionCommand request, CancellationToken cancellationToken)
    {
        _logger.LogDebug("Creating new transaction.");
        await _validator.ValidateAndThrowAsync(request, cancellationToken);
        request.Transaction.UserId = _caller.UserId;

        var result = await _supabase.From<Transaction>().Insert(request.Transaction);
        var inserted = result.Models.First();
        _logger.LogInformation("Transaction created with ID: {Id}", inserted.Id);

        await _mediator.Publish(new TransactionCreatedEvent(inserted), cancellationToken);
        return inserted;
    }
}
