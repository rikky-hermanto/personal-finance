using System.Collections.Concurrent;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace PersonalFinance.Tests.Support;

public sealed record RecordedRequest(
    string Method, string Table, string Query, string Body, IReadOnlyDictionary<string, string> Headers);

public sealed record FakeResponse(string Json, int Status = 200, string? ContentRange = null);

/// <summary>
/// In-process stand-in for PostgREST. The real Supabase.Client is pointed at it, so services are
/// tested exactly as written. Postgrest-csharp uses its own static HttpClient, so a handler stub
/// cannot be injected; a real loopback server is the only seam. Unstubbed requests return 501 so a
/// missing stub fails the test instead of silently returning an empty list.
/// </summary>
/// <remarks>
/// <para>What the SDK sends and what a stub must return (pinned by FakePostgrestTests):</para>
/// <code>
/// Call     | Sends                                                     | Stub must return
/// ---------+-----------------------------------------------------------+--------------------------------------------
/// Get()    | GET; filters and order in the query string; Range(a, b)   | JSON array of rows
///          | goes in a "Range: a-b" header, not in the query           |
/// Single() | GET; "Accept: application/vnd.pgrst.object+json"          | one JSON object; for no row or several rows,
///          |                                                           | status 406 (the SDK returns null)
/// Count()  | HEAD; "Prefer: count=exact"                               | contentRange "0-0/42" (throws without it)
/// Insert() | POST; "Prefer: return=representation"; every column,      | JSON array of saved rows (status 201)
///          | unset ones as null; object for one row, array for a list  |
/// Update() | PATCH; filter in the query; after Set() only the set      | JSON array of updated rows
///          | columns are sent                                          |
/// Delete() | DELETE; filter in the query; no body                      | JSON array of deleted rows
/// Upsert() | POST; "Prefer: resolution=merge-duplicates,               | JSON array of saved rows
///          | return=representation"                                    |
/// Rpc()    | POST rpc/{name}; body is the parameter object             | the function's JSON, read from .Content
/// </code>
/// <para>
/// The SDK is more forgiving than PostgREST: it also accepts an array for Single() and takes the first
/// row. Stub the shape in the table, or the test passes against a response no real server sends.
/// </para>
/// </remarks>
public sealed class FakePostgrest : IAsyncDisposable
{
    private readonly WebApplication _app;
    private readonly ConcurrentQueue<RecordedRequest> _requests = new();
    private readonly ConcurrentDictionary<(string Method, string Table), Func<RecordedRequest, FakeResponse>> _routes = new();

    public string Url { get; private set; } = "";
    public IReadOnlyList<RecordedRequest> Requests => _requests.ToArray();

    private FakePostgrest(WebApplication app) => _app = app;

    public static async Task<FakePostgrest> StartAsync()
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        var app = builder.Build();
        var fake = new FakePostgrest(app);
        app.Map("/rest/v1/{**path}", ctx => fake.HandleAsync(ctx, storage: false));
        app.Map("/storage/v1/{**path}", ctx => fake.HandleAsync(ctx, storage: true));
        await app.StartAsync();
        fake.Url = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();
        return fake;
    }

    /// <summary>
    /// Stub a fixed response. Table is the PostgREST path, e.g. "transactions" or
    /// "rpc/upsert_harvest_months". Storage calls are keyed by their full path under /storage/v1,
    /// e.g. "storage/object/bank-statements/u/BCA/file.csv".
    /// </summary>
    public FakePostgrest On(string method, string table, string json, int status = 200, string? contentRange = null)
        => On(method, table, _ => new FakeResponse(json, status, contentRange));

    public FakePostgrest On(string method, string table, Func<RecordedRequest, FakeResponse> respond)
    {
        _routes[(method.ToUpperInvariant(), table)] = respond;
        return this;
    }

    public IEnumerable<RecordedRequest> RequestsTo(string method, string table)
        => Requests.Where(r => r.Method == method.ToUpperInvariant() && r.Table == table);

    /// <summary>Builds a client the same way Infrastructure/Supabase/DependencyInjection.cs does.</summary>
    public async Task<global::Supabase.Client> CreateClientAsync(string accessToken = TestCaller.Token)
    {
        var client = new global::Supabase.Client(Url, "anon-key", new global::Supabase.SupabaseOptions
        {
            AutoRefreshToken = false,
            AutoConnectRealtime = false,
            Headers = new Dictionary<string, string> { ["Authorization"] = $"Bearer {accessToken}" },
        });
        await client.InitializeAsync();
        return client;
    }

    private async Task HandleAsync(HttpContext ctx, bool storage)
    {
        using var reader = new StreamReader(ctx.Request.Body);
        var body = await reader.ReadToEndAsync();
        var path = (string?)ctx.Request.RouteValues["path"] ?? "";
        var segments = path.Split('/');
        var table = storage ? $"storage/{path}"
            : segments[0] == "rpc" && segments.Length > 1 ? $"rpc/{segments[1]}" : segments[0];
        var recorded = new RecordedRequest(
            ctx.Request.Method, table, ctx.Request.QueryString.Value ?? "", body,
            ctx.Request.Headers.ToDictionary(h => h.Key, h => h.Value.ToString(), StringComparer.OrdinalIgnoreCase));
        _requests.Enqueue(recorded);

        var response = _routes.TryGetValue((recorded.Method, table), out var respond)
            ? respond(recorded)
            : new FakeResponse($"{{\"message\":\"FakePostgrest: no stub for {recorded.Method} {table}\"}}", 501);

        ctx.Response.StatusCode = response.Status;
        ctx.Response.ContentType = "application/json";
        if (response.ContentRange is not null) ctx.Response.Headers["Content-Range"] = response.ContentRange;
        await ctx.Response.WriteAsync(response.Json);
    }

    public async ValueTask DisposeAsync() => await _app.DisposeAsync();
}
