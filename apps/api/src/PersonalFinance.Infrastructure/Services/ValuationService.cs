using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static global::Supabase.Postgrest.Constants;

namespace PersonalFinance.Infrastructure.Services;

public class ValuationService(
    global::Supabase.Client supabase,
    ILogger<ValuationService> logger
) : IValuationService
{
    public async Task<Valuation?> GetLatestAsync(string subjectType, Guid subjectId, CancellationToken ct = default)
    {
        logger.LogDebug("Getting latest valuation for {SubjectType}:{SubjectId}", subjectType, subjectId);

        return await supabase.From<Valuation>()
            .Filter("subject_type", Operator.Equals, subjectType)
            .Filter("subject_id", Operator.Equals, subjectId.ToString())
            .Order("valued_at", Ordering.Descending)
            .Limit(1)
            .Single();
    }

    public async Task<IReadOnlyList<Valuation>> GetHistoryAsync(string subjectType, Guid subjectId, CancellationToken ct = default)
    {
        logger.LogDebug("Getting valuation history for {SubjectType}:{SubjectId}", subjectType, subjectId);

        var result = await supabase.From<Valuation>()
            .Filter("subject_type", Operator.Equals, subjectType)
            .Filter("subject_id", Operator.Equals, subjectId.ToString())
            .Order("valued_at", Ordering.Descending)
            .Get();

        return result.Models.AsReadOnly();
    }
}
