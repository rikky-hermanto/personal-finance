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
        var existing = await _supabase.From<Transaction>().Get();
        var count = existing.Models.Count;

        if (count == 0)
        {
            _logger.LogInformation("Reset requested but transactions table is already empty.");
            return 0;
        }

        await _supabase.From<Transaction>()
            .Filter("id", Operator.GreaterThan, "0")
            .Delete();

        _logger.LogWarning("Deleted all {Count} transactions via reset command.", count);
        return count;
    }
}
