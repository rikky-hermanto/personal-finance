using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;
using PersonalFinance.Application.Interfaces;

public class DeleteAllTransactionsCommandHandler : IRequestHandler<DeleteAllTransactionsCommand, int>
{
    private readonly Supabase.Client _supabase;
    private readonly ILogger<DeleteAllTransactionsCommandHandler> _logger;
    private readonly ICurrentUser _caller;

    public DeleteAllTransactionsCommandHandler(Supabase.Client supabase, ILogger<DeleteAllTransactionsCommandHandler> logger, ICurrentUser caller)
    {
        _supabase = supabase;
        _logger = logger;
        _caller = caller;
    }

    public async Task<int> Handle(DeleteAllTransactionsCommand request, CancellationToken cancellationToken)
    {
        await _supabase.From<Transaction>()
            .Filter("user_id", Operator.Equals, _caller.UserId.ToString())
            .Filter("id", Operator.GreaterThan, "0")
            .Delete();

        await _supabase.From<UploadedFile>()
            .Filter("user_id", Operator.Equals, _caller.UserId.ToString())
            .Filter("id", Operator.GreaterThan, "0")
            .Delete();

        _logger.LogWarning("Deleted transactions and file hashes via reset command.");
        return 0;
    }
}
