using System.Globalization;
using System.Text.Json;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Tests.Authentication;

/// <summary>
/// Preview half of the PF-S08 duplicate parity matrix. The same fixture runs
/// against the SQL submit RPC via scripts/pf_s08_dedup_parity.py.
/// </summary>
public sealed class DedupParityTests
{
    private static readonly Guid AccountA = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");

    public static TheoryData<string> CaseNames()
    {
        var data = new TheoryData<string>();
        foreach (var c in LoadCases()) data.Add(c.GetProperty("name").GetString()!);
        return data;
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public void TagDuplicatesLogic_SharedParityCase_MatchesExpected(string name)
    {
        // Arrange
        var testCase = LoadCases().Single(c => c.GetProperty("name").GetString() == name);
        var existing = testCase.GetProperty("existing").EnumerateArray().Select(ToEntity).ToList();
        var incoming = testCase.GetProperty("incoming").EnumerateArray().Select(ToDto).ToList();
        var expected = testCase.GetProperty("expected").EnumerateArray().Select(e => e.GetBoolean()).ToList();

        // Act
        var tagged = TransactionService.TagDuplicatesLogic(incoming, existing);

        // Assert
        Assert.Equal(expected, tagged.Select(t => t.IsDuplicate).ToList());
    }

    private static List<JsonElement> LoadCases()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Fixtures", "pf-s08-dedup-parity.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        return doc.RootElement.GetProperty("cases").EnumerateArray().Select(c => c.Clone()).ToList();
    }

    private static DateTime Date(JsonElement row) =>
        DateTimeOffset.Parse(row.GetProperty("date").GetString()!, CultureInfo.InvariantCulture).UtcDateTime;

    private static decimal? Optional(JsonElement row, string field) =>
        row.TryGetProperty(field, out var v) ? decimal.Parse(v.GetString()!, CultureInfo.InvariantCulture) : null;

    private static string Flow(JsonElement row) =>
        row.TryGetProperty("flow", out var v) ? v.GetString()! : "CR";

    private static Guid? Account(JsonElement row) =>
        row.TryGetProperty("account", out _) ? AccountA : null;

    private static Transaction ToEntity(JsonElement row) => new()
    {
        Date = Date(row),
        Description = row.GetProperty("description").GetString()!,
        AmountIdr = Optional(row, "amount")!.Value,
        StatementBalance = Optional(row, "balance"),
        Flow = Flow(row),
        AccountId = Account(row),
    };

    private static TransactionDto ToDto(JsonElement row) => new()
    {
        Date = Date(row),
        Description = row.GetProperty("description").GetString()!,
        AmountIdr = Optional(row, "amount")!.Value,
        StatementBalance = Optional(row, "balance"),
        Flow = Flow(row),
        AccountId = Account(row),
    };
}
