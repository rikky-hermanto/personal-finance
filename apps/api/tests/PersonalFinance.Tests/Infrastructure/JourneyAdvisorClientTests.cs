using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Infrastructure.External;

namespace PersonalFinance.Tests.Infrastructure;

public class JourneyAdvisorClientTests
{
    private sealed record TestCaller(Guid UserId, string AccessToken) : ICurrentUser;

    private static readonly TestCaller Caller = new(Guid.Parse("4b6f0c3e-2d55-4a8e-9a43-0d1c7f5e9b21"), "token");

    private static JourneyAdvisorClient BuildClient(HttpMessageHandler handler)
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://ai-service:8000") };
        return new JourneyAdvisorClient(http, Caller, NullLogger<JourneyAdvisorClient>.Instance);
    }

    [Fact]
    public async Task GenerateQuestsAsync_SendsVerifiedCallerAsUserId()
    {
        // Arrange
        var handler = new FakeHttpHandler(HttpStatusCode.OK, "{\"quests\":[]}");
        var client = BuildClient(handler);

        // Act
        await client.GenerateQuestsAsync(SampleState());

        // Assert
        using var sent = JsonDocument.Parse(handler.LastRequestBody!);
        Assert.Equal(Caller.UserId.ToString(), sent.RootElement.GetProperty("user_id").GetString());
    }

    private static JourneyStateDto SampleState() => new(
        CurrentLevel: 1,
        TotalScore: 0m,
        LevelScores: new Dictionary<string, decimal>(),
        Indicators: new List<IndicatorScoreDto>
        {
            new("spend_lt_income", "L1", 20m, null, "in_progress", "Spend < Income", "desc"),
        },
        Achievements: new List<AchievementDto>(),
        LastComputedAt: DateTime.UtcNow);

    // Regression: Pydantic serializes the Python `estimated_score_gain` field as a
    // JSON *string* ("12") when it is typed Decimal. Before the fix this threw
    // JsonException ("Cannot get the value of a token type 'String' as a number")
    // on every /journey load. The client must accept string-encoded numbers.
    [Fact]
    public async Task GenerateQuestsAsync_ScoreGainAsJsonString_ParsesWithoutThrowing()
    {
        var json = JsonSerializer.Serialize(new
        {
            quests = new[]
            {
                new
                {
                    title = "Review your monthly budget",
                    description = "Trim the top spending category.",
                    target_indicator = "spend_lt_income",
                    estimated_score_gain = "12",   // string, as Pydantic emits for Decimal
                    difficulty = "easy",
                    action_deeplink = "/cashflow/analysis",
                },
            },
        });

        var client = BuildClient(new FakeHttpHandler(HttpStatusCode.OK, json));

        var quests = await client.GenerateQuestsAsync(SampleState());

        Assert.Single(quests);
        Assert.Equal(12m, quests[0].EstimatedScoreGain);
        Assert.Equal("Review your monthly budget", quests[0].Title);
    }

    [Fact]
    public async Task GenerateQuestsAsync_ScoreGainAsJsonNumber_ParsesWithoutThrowing()
    {
        var json = JsonSerializer.Serialize(new
        {
            quests = new[]
            {
                new
                {
                    title = "Update your savings balance",
                    description = "Record current savings.",
                    target_indicator = "liquid_savings_ratio",
                    estimated_score_gain = 8,      // number, as the fixed Python side emits
                    difficulty = "easy",
                    action_deeplink = (string?)null,
                },
            },
        });

        var client = BuildClient(new FakeHttpHandler(HttpStatusCode.OK, json));

        var quests = await client.GenerateQuestsAsync(SampleState());

        Assert.Single(quests);
        Assert.Equal(8m, quests[0].EstimatedScoreGain);
    }

    private sealed class FakeHttpHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _status;
        private readonly string _body;

        public FakeHttpHandler(HttpStatusCode status, string body)
        {
            _status = status;
            _body = body;
        }

        public string? LastRequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequestBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(_status)
            {
                Content = new StringContent(_body, Encoding.UTF8, "application/json"),
            };
        }
    }
}
