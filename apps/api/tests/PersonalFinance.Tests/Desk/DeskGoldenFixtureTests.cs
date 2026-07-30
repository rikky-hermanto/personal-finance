using System.Text.Json;
using System.Text.Json.Serialization;
using PersonalFinance.Application.Dtos.Desk;
using PersonalFinance.Application.Services.Desk;
using Xunit;

namespace PersonalFinance.Tests.Desk;

/// <summary>
/// Drives every case in Desk/fixtures/desk-golden.json through the real DeskCalculator.
/// This is the compensating control for the deliberate C#/TS engine duplication (STEP 11) —
/// the same fixture file also drives apps/frontend/src/lib/desk/__tests__/parity.test.ts.
/// </summary>
public class DeskGoldenFixtureTests
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public static IEnumerable<object[]> Cases()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Desk", "fixtures", "desk-golden.json");
        var json = File.ReadAllText(path);
        var file = JsonSerializer.Deserialize<FixtureFile>(json, JsonOpts)
                   ?? throw new InvalidOperationException("desk-golden.json failed to deserialize");
        foreach (var c in file.Cases)
            yield return new object[] { c };
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void GoldenFixture_ProducesExpectedOutput(FixtureCase testCase)
    {
        var input = testCase.Input;
        var asOfDate = DateOnly.Parse(input.AsOfDate);

        var chain = DeskCalculator.ComputeNavChain(input.NavChainInput);
        var sizing = input.TradePlanInput is not null
            ? DeskCalculator.ComputeSizing(input.TradePlanInput, chain, input.Mandate)
            : null;
        var journalStats = DeskCalculator.ComputeJournalStats(input.JournalEntries);
        var gateMandate = input.GateMandate ?? input.Mandate;
        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, sizing, input.TradePlanInput, gateMandate, journalStats, input.JournalEntries, input.Positions, asOfDate));

        AssertNavChainEqual(testCase.Expected.NavChain, chain, testCase.Name);
        AssertSizingEqual(testCase.Expected.Sizing, sizing, testCase.Name);
        Assert.Equal(testCase.Expected.JournalStats, journalStats);
        AssertGateEqual(testCase.Expected.Gate, gate, testCase.Name);

        // Structural invariant, re-asserted per fixture case.
        Assert.DoesNotContain(gate.Rows, r => r.State == "pass" && r.NotImplemented);
    }

    private static void AssertNavChainEqual(NavChainDto expected, NavChainDto actual, string caseName)
    {
        Assert.True(expected == actual, $"[{caseName}] NAV chain mismatch.\nExpected: {expected}\nActual:   {actual}");
    }

    private static void AssertSizingEqual(SizingDto? expected, SizingDto? actual, string caseName)
    {
        if (expected is null || actual is null)
        {
            Assert.True(expected is null && actual is null, $"[{caseName}] sizing null-ness mismatch.");
            return;
        }

        Assert.True(expected with { Caps = null } == actual with { Caps = null },
            $"[{caseName}] sizing mismatch (excluding caps).\nExpected: {expected}\nActual:   {actual}");
        Assert.Equal(expected.Caps ?? new(), actual.Caps ?? new());
    }

    private static void AssertGateEqual(GateResultDto expected, GateResultDto actual, string caseName)
    {
        Assert.True(expected.Overall == actual.Overall, $"[{caseName}] overall gate status mismatch: expected {expected.Overall}, got {actual.Overall}");
        Assert.Equal(expected.Rows, actual.Rows);
        Assert.Equal(expected.BlockingReasons, actual.BlockingReasons);
    }
}

public record FixtureFile(List<FixtureCase> Cases);

public record FixtureCase(string Name, FixtureInput Input, FixtureExpected Expected);

public record FixtureInput(
    MandateParamsDto Mandate,
    MandateParamsDto? GateMandate,
    NavChainInputDto NavChainInput,
    List<DeskPositionDto> Positions,
    List<DeskJournalEntryDto> JournalEntries,
    TradePlanInputDto? TradePlanInput,
    string AsOfDate
);

public record FixtureExpected(
    NavChainDto NavChain,
    SizingDto? Sizing,
    JournalStatsDto JournalStats,
    GateResultDto Gate
);
