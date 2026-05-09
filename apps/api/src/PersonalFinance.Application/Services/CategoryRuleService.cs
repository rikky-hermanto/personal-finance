using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;
using Microsoft.Extensions.Logging;

public class CategoryRuleService : ICategoryRuleService
{
    private readonly Supabase.Client _supabase;
    private readonly IMediator _mediator;
    private readonly ILogger<CategoryRuleService> _logger;

    public CategoryRuleService(Supabase.Client supabase, IMediator mediator, ILogger<CategoryRuleService> logger)
    {
        _supabase = supabase;
        _mediator = mediator;
        _logger = logger;
    }

    public async Task<string> CategorizeAsync(string description, string type)
    {
        _logger.LogDebug("Categorizing description of type {Type}", type);
        var result = await _supabase.From<CategoryRule>()
            .Filter("type", Operator.ILike, type)
            .Order("keyword_length", Ordering.Descending)
            .Get();

        foreach (var rule in result.Models)
        {
            if (description.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
                return rule.Category;
        }

        return "Untracked Category";
    }

    public async Task<List<TransactionDto>> CategorizeBatchAsync(List<TransactionDto> transactions)
    {
        _logger.LogDebug("Batch categorizing {Count} transactions.", transactions.Count);

        // Pre-gate: preserve source-supplied Type AND Category.
        // If the source file already supplied BOTH a non-default Type AND a non-default Category
        // (e.g. master CSV rows with Type="Saving" Category="Emergency Fund"), preserve both as-is.
        // The engine must never override a source-supplied Type — it is the user's ground truth.
        var needsCategorization = transactions
            .Where(tx => string.IsNullOrWhiteSpace(tx.Category)
                || tx.Category.Equals("Untracked Expense", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (needsCategorization.Count == 0)
            return transactions;

        // ── Layers 0 + 1: History cache (one Supabase query, two lookup dictionaries) ─────────
        // Build two dictionaries from a single round-trip:
        //   descCache: (description, flow) → category  [Layer 0 — stable merchant name]
        //   remCache:  (remarks, flow)     → category  [Layer 1 — bank-generated text]
        var historyResult = await _supabase.From<Transaction>()
            .Select("description,remarks,flow,category")
            .Get();

        var categorized = historyResult.Models
            .Where(t => !string.IsNullOrWhiteSpace(t.Category)
                     && !t.Category.Equals("Untracked Expense", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var descCache = categorized
            .Where(t => !string.IsNullOrWhiteSpace(t.Description))
            .GroupBy(t => (Squash(t.Description), t.Flow?.ToUpperInvariant()))
            .ToDictionary(g => g.Key, g => g.First().Category);

        var remCache = categorized
            .Where(t => !string.IsNullOrWhiteSpace(t.Remarks))
            .GroupBy(t => (Squash(t.Remarks), t.Flow?.ToUpperInvariant()))
            .ToDictionary(g => g.Key, g => g.First().Category);

        var stillNeeded = new List<TransactionDto>();
        foreach (var tx in needsCategorization)
        {
            var flow = tx.Flow?.ToUpperInvariant();

            // Layer 0: Description — squashed so whitespace drift between bank format versions
            // ("BI-FAST CR TRANSFER   DR" vs "BI-FAST CR TRANSFER DR") still hits the cache.
            if (!string.IsNullOrWhiteSpace(tx.Description))
            {
                var descKey = (Squash(tx.Description), flow);
                if (descCache.TryGetValue(descKey, out var fromDesc))
                {
                    tx.Category = fromDesc;
                    _logger.LogDebug("Layer 0 cache hit (Description): '{Desc}' → '{Cat}'", tx.Description, fromDesc);
                    continue;
                }
            }

            // Layer 1: Remarks — same squash treatment.
            if (!string.IsNullOrWhiteSpace(tx.Remarks))
            {
                var remKey = (Squash(tx.Remarks), flow);
                if (remCache.TryGetValue(remKey, out var fromRem))
                {
                    tx.Category = fromRem;
                    _logger.LogDebug("Layer 1 cache hit (Remarks): '{Rem}' → '{Cat}'", tx.Remarks, fromRem);
                    continue;
                }
            }

            stillNeeded.Add(tx);
        }

        if (stillNeeded.Count == 0)
        {
            _logger.LogInformation("All {Count} transactions resolved by history cache (Layers 0+1).", needsCategorization.Count);
            return transactions;
        }

        // ── Layer 2: Flow-aware rule engine ──────────────────────────────────────
        var rulesResult = await _supabase.From<CategoryRule>()
            .Order("keyword_length", Ordering.Descending)
            .Get();
        var rules = rulesResult.Models;

        foreach (var tx in stillNeeded)
        {
            var normDesc = Squash(tx.Description);
            var normRem  = Squash(tx.Remarks);

            var typeRules = rules.Where(r =>
                r.Type.Equals(tx.Type, StringComparison.OrdinalIgnoreCase));

            // "Asset Transfer" rules act as a cross-type override tier.
            // They run after type-matched rules but before giving up — a transaction the
            // parser classified as Income/Expense can be reclassified when a specific
            // transfer-channel keyword (e.g. "BI-FAST") matches.
            var assetTransferRules = rules.Where(r =>
                r.Type.Equals("Asset Transfer", StringComparison.OrdinalIgnoreCase)
                && !r.Type.Equals(tx.Type, StringComparison.OrdinalIgnoreCase));

            // Priority: flow-specific same-type → flow-agnostic same-type → asset-transfer override.
            var ordered = typeRules
                .Where(r => !string.IsNullOrEmpty(r.Flow) && r.Flow.Equals(tx.Flow, StringComparison.OrdinalIgnoreCase))
                .Concat(typeRules.Where(r => string.IsNullOrEmpty(r.Flow)))
                .Concat(assetTransferRules);

            foreach (var rule in ordered)
            {
                var normKeyword = Squash(rule.Keyword);

                // Squash both sides — tolerates BCA format drift (extra spaces, casing changes).
                if (normDesc.Contains(normKeyword, StringComparison.Ordinal)
                    || normRem.Contains(normKeyword, StringComparison.Ordinal))
                {
                    tx.Category = rule.Category;
                    tx.Type     = rule.Type; // Allow asset-transfer rules to fix a mis-typed transaction.
                    _logger.LogDebug("Layer 2 rule match: '{Keyword}' (type={Type}, flow={Flow}) → '{Cat}'",
                        rule.Keyword, rule.Type, rule.Flow ?? "any", rule.Category);
                    break;
                }
            }
        }

        return transactions;
    }

    public async Task<List<CategoryRuleDto>> GetAllAsync()
    {
        var result = await _supabase.From<CategoryRule>()
            .Order("keyword_length", Ordering.Descending)
            .Get();
        return result.Models.Select(MapToDto).ToList();
    }

    public async Task<CategoryRuleDto?> GetByIdAsync(int id)
    {
        var rule = await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, id.ToString())
            .Single();
        return rule == null ? null : MapToDto(rule);
    }

    public async Task<CategoryRuleDto> AddAsync(CategoryRuleDto ruleDto)
    {
        var rule = MapToEntity(ruleDto);
        var created = await _mediator.Send(new CreateCategoryRuleCommand(rule));
        return MapToDto(created);
    }

    public async Task<CategoryRuleDto?> UpdateAsync(int id, CategoryRuleDto ruleDto)
    {
        var rule = MapToEntity(ruleDto);
        var updated = await _mediator.Send(new UpdateCategoryRuleCommand(id, rule));
        return updated == null ? null : MapToDto(updated);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        return await _mediator.Send(new DeleteCategoryRuleCommand(id));
    }

    public async Task<bool> DeleteAllAsync()
    {
        var count = await _mediator.Send(new DeleteAllCategoryRulesCommand());
        return true;
    }

    public async Task EnsureCategoryRulesAsync(List<TransactionDto> transactions)
    {
        var existingRules = await GetAllAsync();

        foreach (var dto in transactions)
        {
            if (string.IsNullOrWhiteSpace(dto.Category)) continue;

            var alreadyExists = existingRules.Any(r =>
                r.Category == dto.Category &&
                r.Type == dto.Type);

            if (!alreadyExists && dto.CategoryRuleDto is not null)
            {
                var created = await AddAsync(dto.CategoryRuleDto);
                existingRules.Add(created);
            }
        }
    }

    // Collapses any whitespace run to a single space and lowercases — applied symmetrically
    // on both stored descriptions and incoming ones so format drift doesn't break matching.
    private static string Squash(string? input) =>
        string.IsNullOrWhiteSpace(input)
            ? string.Empty
            : string.Join(' ', input.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
                    .ToLowerInvariant();

    private static CategoryRuleDto MapToDto(CategoryRule entity) => new()
    {
        Id = entity.Id,
        Keyword = entity.Keyword,
        Type = entity.Type,
        Category = entity.Category,
        KeywordLength = entity.KeywordLength,
        Flow = entity.Flow
    };

    private static CategoryRule MapToEntity(CategoryRuleDto dto) => new()
    {
        Id = dto.Id,
        Keyword = dto.Keyword,
        Type = dto.Type,
        Category = dto.Category,
        Flow = dto.Flow
    };
}
