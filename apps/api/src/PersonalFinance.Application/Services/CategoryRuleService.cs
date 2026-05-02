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

        // Preserve source-supplied categories (e.g. from CSV re-import of master spreadsheet).
        // Only re-categorize rows that are blank or still at the default placeholder.
        var needsCategorization = transactions
            .Where(tx => string.IsNullOrWhiteSpace(tx.Category)
                || tx.Category.Equals("Untracked Expense", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (needsCategorization.Count == 0)
            return transactions;

        var result = await _supabase.From<CategoryRule>()
            .Order("keyword_length", Ordering.Descending)
            .Get();

        var rules = result.Models;

        foreach (var tx in needsCategorization)
        {
            var typeRules = rules.Where(r => r.Type.Equals(tx.Type, StringComparison.OrdinalIgnoreCase));
            foreach (var rule in typeRules)
            {
                if (tx.Description.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
                {
                    tx.Category = rule.Category;
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

    private static CategoryRuleDto MapToDto(CategoryRule entity) => new()
    {
        Id = entity.Id,
        Keyword = entity.Keyword,
        Type = entity.Type,
        Category = entity.Category,
        KeywordLength = entity.KeywordLength
    };

    private static CategoryRule MapToEntity(CategoryRuleDto dto) => new()
    {
        Id = dto.Id,
        Keyword = dto.Keyword,
        Type = dto.Type,
        Category = dto.Category
    };
}
