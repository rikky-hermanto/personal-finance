using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Infrastructure.Supabase;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Tests.Authentication;

public sealed class SupabaseClientScopeTests
{
    private sealed record TestCaller(Guid UserId, string AccessToken) : ICurrentUser;

    [Fact]
    public async Task AddSupabase_TwoScopes_KeepBearerTokensSeparate()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var observed = new ConcurrentBag<string>();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var server = Task.Run(async () =>
        {
            while (observed.Count < 2)
            {
                using var connection = await listener.AcceptTcpClientAsync(timeout.Token);
                var stream = connection.GetStream();
                using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
                string? line;
                while (!string.IsNullOrEmpty(line = await reader.ReadLineAsync(timeout.Token)))
                {
                    if (line.StartsWith("Authorization:", StringComparison.OrdinalIgnoreCase))
                        observed.Add(line["Authorization:".Length..].Trim());
                }
                var response = Encoding.ASCII.GetBytes(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n[]");
                await stream.WriteAsync(response, timeout.Token);
            }
        }, timeout.Token);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Supabase:Url"] = $"http://127.0.0.1:{port}",
            ["Supabase:AnonKey"] = "test-anon-key",
            ["Supabase:ServiceRoleKey"] = "test-service-key"
        }).Build();
        var tokens = new Queue<string>(["user-a-token", "user-b-token"]);
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddScoped<ICurrentUser>(_ => new TestCaller(Guid.NewGuid(), tokens.Dequeue()));
        services.AddSupabase(config);

        using var provider = services.BuildServiceProvider();
        using var scopeA = provider.CreateScope();
        using var scopeB = provider.CreateScope();
        var clientA = scopeA.ServiceProvider.GetRequiredService<Supabase.Client>();
        var clientB = scopeB.ServiceProvider.GetRequiredService<Supabase.Client>();

        Assert.NotSame(clientA, clientB);
        await Task.WhenAll(clientA.From<Transaction>().Get(), clientB.From<Transaction>().Get());
        await server;
        Assert.Contains("Bearer user-a-token", observed);
        Assert.Contains("Bearer user-b-token", observed);
    }
}
