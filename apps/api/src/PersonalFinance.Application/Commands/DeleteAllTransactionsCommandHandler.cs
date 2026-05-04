using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class DeleteAllTransactionsCommandHandler : IRequestHandler<DeleteAllTransactionsCommand, int>
{
    private readonly Supabase.Client _supabase;
    private readonly ILogger<DeleteAllTransactionsCommandHandler> _logger;

    public DeleteAllTransactionsCommandHandler(Supabase.Client supabase, ILogger<DeleteAllTransactionsCommandHandler> logger)
    {
        _supabase = supabase;
        _logger = logger;
    }

    public async Task<int> Handle(DeleteAllTransactionsCommand request, CancellationToken cancellationToken)
    {
        await _supabase.From<Transaction>()
            .Filter("id", Operator.GreaterThan, "0")
            .Delete();

        await _supabase.From<UploadedFile>()
            .Filter("id", Operator.GreaterThan, "0")
            .Delete();

        _logger.LogWarning("Deleted transactions and file hashes via reset command.");
        return 0;
    }
}
