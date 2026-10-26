using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using Supabase.Postgrest;
using Supabase.Postgrest.Exceptions;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Infrastructure.Supabase;

/// <summary>PostgREST access for the quest engine and board. Reads filter by user_id as well as relying
/// on RLS. Writes log at Error and rethrow: the earlier scoring code swallowed write errors, which is how
/// journey_indicator_snapshots ended up empty without anyone noticing.</summary>
public sealed class SupabaseQuestStore(
    global::Supabase.Client supabase,
    ILogger<SupabaseQuestStore> logger) : IQuestStore
{
    public async Task<IReadOnlyList<QuestCompletion>> LoadCompletionsAsync(Guid userId, CancellationToken ct = default)
    {
        var rows = await supabase.From<QuestCompletion>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Order("completed_at", Ordering.Ascending)
            .Get();
        return rows.Models;
    }

    public async Task<IReadOnlyList<Account>> LoadCashflowAccountsAsync(Guid userId, CancellationToken ct = default)
    {
        var rows = await supabase.From<Account>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Filter("is_active", Operator.Equals, "true")
            .Filter("include_in_cashflow", Operator.Equals, "true")
            .Get();
        return rows.Models;
    }

    public async Task<bool> AnyTransactionAsync(Guid userId, CancellationToken ct = default)
    {
        // No date window on purpose: a user whose only data predates the scoring window still completes "Meet your money".
        var rows = await supabase.From<Transaction>()
            .Select("id")
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Limit(1)
            .Get();
        return rows.Models.Count > 0;
    }

    public async Task<QuestStateRow> LoadStateAsync(Guid userId, CancellationToken ct = default)
    {
        var scores = (await supabase.From<UserJourneyState>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get()).Models.FirstOrDefault();
        var focus = (await supabase.From<UserJourneyFocus>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get()).Models.FirstOrDefault();
        var snoozes = (await supabase.From<UserJourneySnoozes>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get()).Models.FirstOrDefault();

        return new QuestStateRow(
            scores,
            focus?.FocusQuestCode,
            snoozes?.QuestSnoozes ?? new Dictionary<string, string>());
    }

    public async Task InsertCompletionsAsync(IReadOnlyList<QuestCompletion> rows, CancellationToken ct = default)
    {
        if (rows.Count == 0) return;
        try
        {
            // One plain insert per row, never an upsert: an upsert serializes the primary key (id = 0 for every
            // row, so the batch collides with itself), and a merge would overwrite seen_at. A row that already
            // exists on the unique key is simply already stored (two concurrent passes, or a re-run).
            foreach (var row in rows)
            {
                try
                {
                    await supabase.From<QuestCompletion>().Insert(row, new QueryOptions
                    {
                        Returning = QueryOptions.ReturnType.Minimal,
                    });
                }
                catch (PostgrestException ex) when (IsAlreadyStored(ex))
                {
                    logger.LogDebug("Quest completion {Code}#{Rung} was already stored", row.QuestCode, row.Rung);
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Storing {Count} quest completions failed", rows.Count);
            throw;
        }
    }

    // 23505 on the (user_id, quest_code, rung) key only; a primary-key clash is a real bug and must surface.
    private static bool IsAlreadyStored(PostgrestException ex) =>
        ex.Message.Contains("23505", StringComparison.Ordinal)
        && ex.Message.Contains("quest_completions_user_id_quest_code_rung_key", StringComparison.Ordinal);

    public async Task SetFocusAsync(Guid userId, string? questCode, CancellationToken ct = default)
    {
        try
        {
            await supabase.From<UserJourneyFocus>()
                .Upsert(new UserJourneyFocus { UserId = userId, FocusQuestCode = questCode });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Setting the focus quest failed for user {UserId}", userId);
            throw;
        }
    }

    public async Task SetSnoozesAsync(Guid userId, IReadOnlyDictionary<string, string> snoozes, CancellationToken ct = default)
    {
        try
        {
            await supabase.From<UserJourneySnoozes>()
                .Upsert(new UserJourneySnoozes { UserId = userId, QuestSnoozes = new Dictionary<string, string>(snoozes) });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Saving quest snoozes failed for user {UserId}", userId);
            throw;
        }
    }

    public async Task MarkSeenAsync(Guid userId, IReadOnlyList<long> ids, DateTime seenAtUtc, CancellationToken ct = default)
    {
        if (ids.Count == 0) return;
        try
        {
            await supabase.From<QuestCompletion>()
                .Filter("user_id", Operator.Equals, userId.ToString())
                .Filter("id", Operator.In, ids.Select(i => i.ToString()).ToList())
                .Filter("seen_at", Operator.Is, "null")
                .Set(c => c.SeenAt!, seenAtUtc)
                .Update();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Marking quest completions seen failed for user {UserId}", userId);
            throw;
        }
    }
}
