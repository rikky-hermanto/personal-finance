using System.Text.Json;
using PersonalFinance.Domain.Entities;
using Supabase.Postgrest.Exceptions;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Tests.Support;

/// <summary>
/// The first two tests prove the seam. The rest pin what the SDK sends and what it needs back for
/// each operation; the same facts are tabled on <see cref="FakePostgrest"/>.
/// </summary>
public sealed class FakePostgrestTests
{
    private const string TransactionRow =
        """{"id":1,"date":"2026-01-05T00:00:00","description":"Coffee","flow":"DB","type":"Expense","amount_idr":25000.50,"currency":"IDR"}""";

    private const string OneTransaction = "[" + TransactionRow + "]";

    private static Transaction Coffee(int id = 0) => new()
    {
        Id = id,
        Date = new DateTime(2026, 1, 5, 0, 0, 0, DateTimeKind.Utc),
        Description = "Coffee",
        AmountIdr = 25000.50m,
    };

    private static JsonElement Json(string body) => JsonDocument.Parse(body).RootElement.Clone();

    [Fact]
    public async Task Get_StubbedTable_ReturnsModelsAndSendsCallerToken()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("GET", "transactions", OneTransaction);
        var client = await fake.CreateClientAsync();

        // Act
        var result = await client.From<Transaction>().Get();

        // Assert
        var model = Assert.Single(result.Models);
        Assert.Equal(25000.50m, model.AmountIdr);
        var request = Assert.Single(fake.Requests);
        Assert.Equal("Bearer verified-user-token", request.Headers["Authorization"]);
    }

    [Fact]
    public async Task Get_UnstubbedTable_Throws()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        var client = await fake.CreateClientAsync();

        // Act
        var exception = await Assert.ThrowsAsync<PostgrestException>(() => client.From<Transaction>().Get());

        // Assert
        Assert.Equal(501, exception.StatusCode);
        Assert.Contains("no stub for GET transactions", exception.Message);
    }

    [Fact]
    public async Task Get_FilterOrderAndRange_SendsQueryStringAndRangeHeader()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("GET", "transactions", OneTransaction);
        var client = await fake.CreateClientAsync();

        // Act
        var result = await client.From<Transaction>()
            .Filter("flow", Operator.Equals, "DB")
            .Order("date", Ordering.Descending)
            .Range(50, 99)
            .Get();

        // Assert
        Assert.Single(result.Models);
        var request = Assert.Single(fake.Requests);
        Assert.Equal("GET", request.Method);
        Assert.Equal("?flow=eq.DB&order=date.desc.nullsfirst", request.Query);
        Assert.Equal("50-99", request.Headers["Range"]);
        Assert.Equal("items", request.Headers["Range-Unit"]);
    }

    [Fact]
    public async Task Single_ObjectThen406_ReturnsModelThenNull()
    {
        // Arrange: real PostgREST answers this Accept header with a bare object, or with 406 when
        // the filter matches no row or several rows.
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("GET", "transactions", TransactionRow);
        var client = await fake.CreateClientAsync();

        // Act
        var found = await client.From<Transaction>().Filter("id", Operator.Equals, "1").Single();
        fake.On("GET", "transactions",
            """{"code":"PGRST116","message":"JSON object requested, multiple (or no) rows returned"}""", 406);
        var missing = await client.From<Transaction>().Filter("id", Operator.Equals, "2").Single();

        // Assert
        Assert.Equal("Coffee", found?.Description);
        Assert.Null(missing);
        Assert.All(fake.Requests,
            r => Assert.Equal("application/vnd.pgrst.object+json", r.Headers["Accept"]));
    }

    [Fact]
    public async Task Count_Exact_SendsHeadAndReadsTotalFromContentRange()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("HEAD", "transactions", "", contentRange: "0-0/42");
        var client = await fake.CreateClientAsync();

        // Act
        var total = await client.From<Transaction>().Filter("flow", Operator.Equals, "DB").Count(CountType.Exact);

        // Assert
        Assert.Equal(42, total);
        var request = Assert.Single(fake.Requests);
        Assert.Equal("HEAD", request.Method);
        Assert.Equal("count=exact", request.Headers["Prefer"]);
        Assert.Equal("?flow=eq.DB", request.Query);

        // A stub without Content-Range is not a count response.
        fake.On("HEAD", "transactions", "");
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.From<Transaction>().Count(CountType.Exact));
    }

    [Fact]
    public async Task Insert_Model_PostsEveryColumnAndReadsArrayBack()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("POST", "transactions", OneTransaction, 201);
        var client = await fake.CreateClientAsync();

        // Act
        var result = await client.From<Transaction>().Insert(Coffee());

        // Assert
        Assert.Equal(1, Assert.Single(result.Models).Id);
        var request = Assert.Single(fake.Requests);
        Assert.Equal("POST", request.Method);
        Assert.Equal("return=representation", request.Headers["Prefer"]);
        Assert.Equal("Bearer verified-user-token", request.Headers["Authorization"]);
        var body = Json(request.Body);
        Assert.False(body.TryGetProperty("id", out _));
        Assert.Equal(25000.50m, body.GetProperty("amount_idr").GetDecimal());
        // The SDK sends unset columns as explicit nulls, so an unset owner still appears in the body.
        Assert.Equal(JsonValueKind.Null, body.GetProperty("user_id").ValueKind);
    }

    [Fact]
    public async Task Update_SetOneColumn_PatchesOnlyThatColumnWithTheFilter()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("PATCH", "transactions", OneTransaction);
        var client = await fake.CreateClientAsync();

        // Act
        var result = await client.From<Transaction>()
            .Filter("id", Operator.Equals, "1")
            .Set(t => t.Category, "Food")
            .Update();

        // Assert
        Assert.Single(result.Models);
        var request = Assert.Single(fake.Requests);
        Assert.Equal("PATCH", request.Method);
        Assert.Equal("?id=eq.1", request.Query);
        Assert.Equal("return=representation", request.Headers["Prefer"]);
        Assert.Equal("""{"category":"Food"}""", request.Body);
    }

    [Fact]
    public async Task Delete_Filtered_SendsFilterAndNoBody()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("DELETE", "transactions", OneTransaction);
        var client = await fake.CreateClientAsync();

        // Act
        await client.From<Transaction>().Filter("id", Operator.Equals, "1").Delete();

        // Assert
        var request = Assert.Single(fake.Requests);
        Assert.Equal("DELETE", request.Method);
        Assert.Equal("?id=eq.1", request.Query);
        Assert.Equal("", request.Body);
    }

    [Fact]
    public async Task Upsert_Model_PostsWithMergeDuplicatesPreference()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("POST", "transactions", OneTransaction, 201);
        var client = await fake.CreateClientAsync();

        // Act
        await client.From<Transaction>().Upsert(Coffee(id: 1));

        // Assert
        var request = Assert.Single(fake.Requests);
        Assert.Equal("POST", request.Method);
        Assert.Equal("resolution=merge-duplicates,return=representation", request.Headers["Prefer"]);
    }

    [Fact]
    public async Task Rpc_WithParameters_PostsToFunctionPathAndReturnsRawContent()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("POST", "rpc/do_thing", """{"inserted":2}""");
        var client = await fake.CreateClientAsync();

        // Act
        var response = await client.Rpc("do_thing", new Dictionary<string, object> { ["p_count"] = 2 });

        // Assert
        Assert.Equal("""{"inserted":2}""", response.Content);
        var request = Assert.Single(fake.RequestsTo("POST", "rpc/do_thing"));
        Assert.Equal("""{"p_count":2}""", request.Body);
        Assert.Equal("Bearer verified-user-token", request.Headers["Authorization"]);
    }
}
