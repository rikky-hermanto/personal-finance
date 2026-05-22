using MediatR;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands;

public record CategorizePreviewCommand(
    List<string> Descriptions,
    List<string> AvailableCategories
) : IRequest<List<CategorizePreviewResult>>;

public record CategorizePreviewResult(
    string Description,
    string Category,
    double Confidence);

public class CategorizePreviewCommandHandler(
    ILlmSuggestionClient suggestionClient,
    ICategoryRuleService categoryRuleService)
    : IRequestHandler<CategorizePreviewCommand, List<CategorizePreviewResult>>
{
    public async Task<List<CategorizePreviewResult>> Handle(
        CategorizePreviewCommand request,
        CancellationToken ct)
    {
        if (request.Descriptions.Count == 0)
            return [];

        var categories = request.AvailableCategories.Count > 0
            ? request.AvailableCategories
            : (await categoryRuleService.GetAllAsync())
                .Select(r => r.Category)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Order()
                .ToList();

        if (categories.Count == 0)
            return [];

        var suggestions = await suggestionClient.SuggestBatchAsync(
            request.Descriptions, categories, ct);

        return suggestions
            .Select(s => new CategorizePreviewResult(
                s.MerchantPattern,
                s.SuggestedCategory,
                s.Confidence))
            .ToList();
    }
}
