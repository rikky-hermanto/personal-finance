using System.Text.Json;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Tests.Goals;

// FIN-01: every goal money and rate field crosses the API as a JSON string, both ways.
public class GoalDtoSerializationTests
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    [Fact]
    public void Serialize_GoalDto_MoneyIsStringAndNullStaysNull()
    {
        // Arrange
        var dto = new GoalDto { TargetAmount = 300000000.00m, Allocated = 0m, MonthlyNeeded = null, PercentComplete = 12.5m };

        // Act
        var json = JsonSerializer.Serialize(dto, Web);

        // Assert
        Assert.Contains("\"targetAmount\":\"300000000.00\"", json);
        Assert.Contains("\"allocated\":\"0\"", json);
        Assert.Contains("\"percentComplete\":\"12.5\"", json);
        Assert.Contains("\"monthlyNeeded\":null", json);
    }

    [Fact]
    public void Serialize_PageSummaryFoundationAndChildren_MoneyIsString()
    {
        // Arrange
        var page = new GoalPageDto
        {
            Items = [new GoalDto { CostItems = [new GoalCostItemDto(Guid.Empty, "tax", "Tax", 1500000m, 0)] }],
            Foundation = new FoundationCheckDto { EarmarkedInSavings = 5000000m, CurrentDti = 0.18m },
            Summary = new GoalPlanSummaryDto
            {
                MonthlyTotal = 12500000m,
                Segments = [new GoalPlanSegmentDto { BarShare = 62.5m }],
            },
        };
        var contribution = new GoalContributionDto(Guid.Empty, -2500000m, new DateOnly(2026, 11, 1), null, null);

        // Act
        var json = JsonSerializer.Serialize(page, Web);
        var contributionJson = JsonSerializer.Serialize(contribution, Web);

        // Assert
        Assert.Contains("\"amount\":\"1500000\"", json);
        Assert.Contains("\"earmarkedInSavings\":\"5000000\"", json);
        Assert.Contains("\"currentDti\":\"0.18\"", json);
        Assert.Contains("\"monthlyTotal\":\"12500000\"", json);
        Assert.Contains("\"barShare\":\"62.5\"", json);
        Assert.Contains("\"amount\":\"-2500000\"", contributionJson);
        Assert.Contains("\"contributedOn\":\"2026-11-01\"", contributionJson);
    }

    [Fact]
    public void Deserialize_CreateGoalCommand_ReadsMoneyFromStrings()
    {
        // Arrange
        const string json = """
            {"category":"vehicle","name":"Test vehicle","priority":2,"targetAmount":"200000000",
             "targetDate":"2028-11-30","priceGrowthRate":"0.05","plannedMonthlyInstalment":null}
            """;

        // Act
        var command = JsonSerializer.Deserialize<CreateGoalCommand>(json, Web)!;

        // Assert
        Assert.Equal(200_000_000m, command.TargetAmount);
        Assert.Equal(0.05m, command.PriceGrowthRate);
        Assert.Equal(new DateOnly(2028, 11, 30), command.TargetDate);
    }

    [Fact]
    public void Deserialize_ContributionAndPreview_ReadMoneyFromStrings()
    {
        // Act
        var add = JsonSerializer.Deserialize<AddGoalContributionCommand>(
            """{"amount":"-60000000","contributedOn":"2026-11-09"}""", Web)!;
        var preview = JsonSerializer.Deserialize<PreviewGoalQuery>(
            """{"category":"house_land","costItems":[{"itemType":"loan_principal","label":"Loan","amount":"400000000"}],"contributionAmount":"1"}""", Web)!;

        // Assert
        Assert.Equal(-60_000_000m, add.Amount);
        Assert.Equal(400_000_000m, preview.CostItems![0].Amount);
        Assert.Equal(1m, preview.ContributionAmount);
    }
}
