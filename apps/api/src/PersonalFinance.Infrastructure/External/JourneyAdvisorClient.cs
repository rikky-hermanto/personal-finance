using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public class JourneyAdvisorClient(HttpClient http, ILogger<JourneyAdvisorClient> logger)
    : IJourneyAdvisorClient
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<List<JourneyQuestDto>> GenerateQuestsAsync(JourneyStateDto state, CancellationToken ct = default)
    {
        logger.LogInformation("Requesting AI quests for level={Level} score={Score}", state.CurrentLevel, state.TotalScore);

        var payload = new
        {
            user_id = "00000000-0000-0000-0000-000000000001",
            current_level = state.CurrentLevel,
            total_score = state.TotalScore,
            indicators = state.Indicators.Select(i => new
            {
                code = i.Code,
                level = i.Level,
                score = i.Score,
                raw_value = i.RawValue,
                status = i.Status,
            }),
        };

        using var resp = await http.PostAsJsonAsync("/journey/advise", payload, Json, ct);

        if ((int)resp.StatusCode == 502)
        {
            var body = await resp.Content.ReadAsStringAsync(ct);
            logger.LogError("ai-service journey-advise 502: {Body}", body);
            return FallbackQuests(state);
        }

        if (!resp.IsSuccessStatusCode)
        {
            logger.LogWarning("ai-service journey-advise returned {Status}", resp.StatusCode);
            return FallbackQuests(state);
        }

        var result = await resp.Content.ReadFromJsonAsync<QuestsResponse>(Json, ct);
        if (result is null || !result.Quests.Any())
            return FallbackQuests(state);

        logger.LogInformation("Received {Count} quests from AI service", result.Quests.Count);

        return result.Quests.Select(q => new JourneyQuestDto(
            q.Title, q.Description, q.TargetIndicator,
            q.EstimatedScoreGain, q.Difficulty, q.ActionDeeplink)).ToList();
    }

    private static List<JourneyQuestDto> FallbackQuests(JourneyStateDto state)
    {
        var worst = state.Indicators
            .Where(i => i.Status != "no_data" && i.Status != "achieved")
            .OrderBy(i => i.Score)
            .FirstOrDefault();

        return new List<JourneyQuestDto>
        {
            new("Review your monthly budget",
                "Check last month's spending breakdown and identify the top category to reduce.",
                worst?.Code ?? "spend_lt_income", 10m, "easy", "/cashflow/analysis"),
            new("Update your savings account balance",
                "Record your current savings balance to get an accurate emergency fund score.",
                "liquid_savings_ratio", 8m, "easy", "/assets/accounts"),
            new("Check debt obligations",
                "Review your active liabilities and update monthly payment amounts.",
                "manageable_dti", 6m, "medium", "/assets/liabilities"),
        };
    }

    private record QuestsResponse(List<QuestRaw> Quests);

    private record QuestRaw(
        string Title,
        string Description,
        string TargetIndicator,
        decimal EstimatedScoreGain,
        string Difficulty,
        string? ActionDeeplink);
}
