using System.Globalization;
using FluentValidation;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Quests;
using PersonalFinance.Application.Services.Harvest;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Services;

/// <summary>Reads stored state only (completions, state row, accounts, harvest ledger): no scoring, no AI.
/// Decides what to offer; the only writes are focus, snoozes and seen, through IQuestStore.</summary>
public sealed class QuestBoardService(IQuestStore store, IHarvestLedger ledger, TimeProvider time) : IQuestBoardService
{
    private const int MaxCards = 3;
    private static readonly string[] Levels = ["L1", "L2", "L3", "L4", "L5"];

    private sealed record Loaded(
        QuestContext Context,
        IReadOnlyList<IndicatorScoreDto> Indicators,
        IReadOnlyList<QuestCompletion> Completions,
        QuestStateRow State,
        DateOnly Today);

    public async Task<QuestBoardDto> GetBoardAsync(Guid userId, CancellationToken ct = default)
    {
        var loaded = await LoadAsync(userId, ct);
        var ledgerRows = await ledger.ListAsync(ct);
        var candidates = Candidates(loaded);

        var ordered = Order(candidates, loaded);
        var cards = ordered.Take(MaxCards).Select(q => ToCard(q, loaded.Context)).ToList();

        var focusCode = loaded.State.FocusQuestCode;
        QuestCardDto? focus = null;
        var offers = cards;
        if (focusCode is not null && cards.Count > 0 && cards[0].Code == focusCode)
        {
            focus = cards[0];
            offers = cards.Skip(1).ToList();
        }

        var (harvest, rhythm) = BuildHarvest(loaded.Completions, ledgerRows, loaded.Today);

        return new QuestBoardDto(
            QuestCatalog.Version,
            loaded.Context.WorkingLevel,
            focus,
            offers,
            BuildUnseen(loaded.Completions),
            BuildLevelGoal(loaded),
            harvest,
            rhythm);
    }

    private static (HarvestDto? Harvest, RhythmDto Rhythm) BuildHarvest(
        IReadOnlyList<QuestCompletion> completions, IReadOnlyList<HarvestLedgerRow> ledgerRows, DateOnly today)
    {
        var unseenItems = completions
            .Where(c => c.SeenAt is null && QuestCatalog.Find(c.QuestCode) is not null)
            .Select(c => new HarvestInputItem(
                c.Id, c.QuestCode,
                QuestCopy.CompletionTitle(QuestCatalog.Find(c.QuestCode)!, c.Rung, c.Evidence),
                c.Evidence, HarvestAssembler.IsBackfillEvidence(c.Evidence), c.CompletedAt))
            .ToList();
        var unseenMonths = ledgerRows.Where(r => !r.Seen).Select(r => r.Record).ToList();

        var harvest = HarvestAssembler.Build(unseenItems, unseenMonths, gardenTotal: completions.Count);
        var lastFull = new DateOnly(today.Year, today.Month, 1).AddMonths(-1);
        var rhythm = MonthlyRhythm.Compute(ledgerRows.Select(r => r.Record.Month), lastFull);
        return (harvest, rhythm);
    }

    public async Task<QuestBoardDto> SetFocusAsync(Guid userId, string code, CancellationToken ct = default)
    {
        var quest = QuestCatalog.Find(code) ?? throw new KeyNotFoundException($"Unknown quest '{code}'.");
        var loaded = await LoadAsync(userId, ct);
        if (!Candidates(loaded).Any(q => q.Code == quest.Code))
            throw new ValidationException("That quest is not available to focus on right now.");

        await store.SetFocusAsync(userId, quest.Code, ct);
        return await GetBoardAsync(userId, ct);
    }

    public async Task<QuestBoardDto> SnoozeAsync(Guid userId, string code, CancellationToken ct = default)
    {
        var quest = QuestCatalog.Find(code) ?? throw new KeyNotFoundException($"Unknown quest '{code}'.");
        var state = await store.LoadStateAsync(userId, ct);
        var today = Today();

        var snoozes = new Dictionary<string, string>(state.Snoozes)
        {
            [quest.Code] = today.AddMonths(1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        };
        // The column is replaced as a whole, so the complete map is written back.
        await store.SetSnoozesAsync(userId, snoozes, ct);
        if (state.FocusQuestCode == quest.Code) await store.SetFocusAsync(userId, null, ct);

        return await GetBoardAsync(userId, ct);
    }

    public async Task MarkSeenAsync(Guid userId, IReadOnlyList<long> ids, CancellationToken ct = default)
    {
        if (ids.Count == 0) return;
        await store.MarkSeenAsync(userId, ids, time.GetUtcNow().UtcDateTime, ct);
    }

    private DateOnly Today() => DateOnly.FromDateTime(time.GetLocalNow().DateTime);

    private async Task<Loaded> LoadAsync(Guid userId, CancellationToken ct)
    {
        var completions = await store.LoadCompletionsAsync(userId, ct);
        var state = await store.LoadStateAsync(userId, ct);
        var accounts = await store.LoadCashflowAccountsAsync(userId, ct);

        var today = Today();
        var indicators = JourneyScoringService.IndicatorsFromRow(state.Scores);
        var completed = completions.Select(c => (c.QuestCode, (int)c.Rung)).ToHashSet();
        var ctx = QuestContextFactory.FromStoredState(indicators, accounts, completed, today);
        return new Loaded(ctx, indicators, completions, state, today);
    }

    private static bool IsComplete(QuestDefinition q, QuestContext ctx)
    {
        if (q.Rule is AccountsCovered)
        {
            var done = ctx.Completed.Where(c => c.Code == q.Code).Select(c => c.Rung).DefaultIfEmpty(0).Max();
            return done >= ctx.CashflowAccounts.Count;
        }
        if (q.Rungs.Count == 0) return ctx.Completed.Contains((q.Code, 0));
        return Enumerable.Range(1, q.Rungs.Count).All(r => ctx.Completed.Contains((q.Code, r)));
    }

    private static bool IsSnoozed(QuestDefinition q, Loaded loaded) =>
        loaded.State.Snoozes.TryGetValue(q.Code, out var until)
        && DateOnly.TryParseExact(until, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
        && date > loaded.Today;

    private static List<QuestDefinition> Candidates(Loaded loaded)
    {
        var ctx = loaded.Context;
        var working = Array.IndexOf(Levels, ctx.WorkingLevel);
        return QuestCatalog.V1
            .Where(q => q.Kind is QuestKind.Discovery or QuestKind.Ladder)
            .Where(q => q.Rule.Applies(ctx))
            .Where(q => !IsComplete(q, ctx))
            .Where(q => !IsSnoozed(q, loaded))
            .Where(q =>
            {
                // G7: money-moving quests only at the working level; the rest also one level up.
                var level = Array.IndexOf(Levels, q.Level);
                return q.MovesMoney ? level == working : level == working || level == working + 1;
            })
            .ToList();
    }

    private static List<QuestDefinition> Order(List<QuestDefinition> candidates, Loaded loaded)
    {
        var ctx = loaded.Context;
        decimal Fraction(QuestDefinition q) => q.Rule.Progress(ctx, q)?.Fraction ?? 0m;
        int CatalogIndex(QuestDefinition q) => QuestCatalog.V1.ToList().IndexOf(q);

        var ordered = new List<QuestDefinition>();
        var focus = candidates.FirstOrDefault(q => q.Code == loaded.State.FocusQuestCode);
        if (focus is not null) ordered.Add(focus);

        var remaining = candidates.Where(q => q != focus).ToList();
        var quickWin = remaining.Where(q => q.Kind == QuestKind.Discovery)
            .OrderByDescending(Fraction).ThenBy(CatalogIndex).FirstOrDefault();
        if (quickWin is not null)
        {
            ordered.Add(quickWin);
            remaining.Remove(quickWin);
        }

        ordered.AddRange(remaining.OrderByDescending(Fraction).ThenBy(CatalogIndex));
        return ordered;
    }

    private static QuestCardDto ToCard(QuestDefinition q, QuestContext ctx)
    {
        var progress = q.Rule.Progress(ctx, q);
        return new QuestCardDto(
            q.Code,
            q.Kind.ToString().ToLowerInvariant(),
            q.Title,
            q.Why,
            progress is null ? null : new QuestProgressDto(progress.Done, progress.Total, progress.Label),
            q.Deeplink);
    }

    private static bool IsBackfill(QuestCompletion c) =>
        c.Evidence.TryGetValue("backfill", out var v)
        && string.Equals(Convert.ToString(v, CultureInfo.InvariantCulture), "true", StringComparison.OrdinalIgnoreCase);

    private static List<UnseenCompletionDto> BuildUnseen(IReadOnlyList<QuestCompletion> completions)
    {
        var unseen = completions.Where(c => c.SeenAt is null).OrderBy(c => c.CompletedAt).ToList();
        var items = new List<UnseenCompletionDto>();

        var backfill = unseen.Where(IsBackfill).ToList();
        if (backfill.Count > 0)
            items.Add(new UnseenCompletionDto(
                backfill.Select(c => c.Id).ToList(), null, 0,
                $"You'd already completed {backfill.Count} quests",
                backfill.Max(c => c.CompletedAt), true, backfill.Count));

        foreach (var c in unseen.Where(c => !IsBackfill(c)))
        {
            var def = QuestCatalog.Find(c.QuestCode);
            if (def is null) continue;   // a code from a retired catalog version is never celebrated
            items.Add(new UnseenCompletionDto(
                [c.Id], c.QuestCode, c.Rung, QuestCopy.CompletionTitle(def, c.Rung, c.Evidence),
                c.CompletedAt, false, 1));
        }

        return items.OrderBy(i => i.CompletedAt).ToList();
    }

    private static LevelGoalDto? BuildLevelGoal(Loaded loaded)
    {
        var ctx = loaded.Context;
        if (ctx.GraduatedLevels.Count >= Levels.Length) return null;

        var level = ctx.WorkingLevel;
        var live = loaded.Indicators.Where(i => i.Level == level && i.Status != "no_data").ToList();
        if (live.Count == 0)
            return new LevelGoalDto(level, $"{level} is not scored yet", true, []);

        // Source: scoring-rubric.md, Level Graduation Rules: cleared = every live indicator scores 70 or more.
        var gaps = live.Where(i => i.Score < 70m)
            .Select(i => new LevelGoalGapDto(
                i.Code,
                StarRungs.Indicators.Any(s => s.Code == i.Code) ? StarRungs.RungCopy(i.Code, 2) : i.DisplayName,
                i.Stars))
            .ToList();
        return new LevelGoalDto(level, $"Clear {level}", false, gaps);
    }
}
