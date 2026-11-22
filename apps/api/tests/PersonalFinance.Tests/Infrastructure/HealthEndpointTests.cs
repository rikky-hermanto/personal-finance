using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace PersonalFinance.Tests.Infrastructure;

/// <summary>PF-156: liveness route, the local-only Grafana check and the OTel switch used by the cloud deploy.</summary>
public sealed class HealthEndpointTests
{
    private static WebApplicationFactory<PersonalFinance.Api.Program> CreateFactory(
        string environment = "Development", Dictionary<string, string?>? extra = null)
    {
        var settings = new Dictionary<string, string?>
        {
            ["Supabase:Url"] = "http://127.0.0.1:54321",
            ["Supabase:AnonKey"] = "test-anon-key",
            ["Supabase:ServiceRoleKey"] = "test-service-key",
            ["Supabase:JwtSecret"] = "local-test-signing-secret-32-bytes-minimum", // commit-skill:allow (fake key for the in-process test server)
            ["Supabase:JwtValidationMode"] = "LegacySecret",
            ["Supabase:JwtIssuer"] = "http://127.0.0.1:54321/auth/v1",
            ["Supabase:JwtAudience"] = "authenticated",
            ["OTEL_ENABLED"] = "false"
        };
        // A null value in extra removes the default, so the app falls back to its own default.
        foreach (var (key, value) in extra ?? [])
        {
            if (value is null) settings.Remove(key);
            else settings[key] = value;
        }

        // UseSetting, not ConfigureAppConfiguration: Program.cs reads OTEL_ENABLED and the Grafana URL
        // before builder.Build(), and only host settings are visible that early under WebApplicationFactory.
        return new WebApplicationFactory<PersonalFinance.Api.Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            foreach (var (key, value) in settings) builder.UseSetting(key, value);
        });
    }

    private static IReadOnlyList<string> HealthCheckNames(WebApplicationFactory<PersonalFinance.Api.Program> factory) =>
        factory.Services.GetRequiredService<IOptions<HealthCheckServiceOptions>>()
            .Value.Registrations.Select(r => r.Name).ToList();

    [Fact]
    public async Task HealthLive_NoToken_ReturnsOk()
    {
        // Arrange
        using var factory = CreateFactory();

        // Act
        var response = await factory.CreateClient().GetAsync("/health/live");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Startup_OtelDisabledInProduction_ServesRequests()
    {
        // Arrange
        using var factory = CreateFactory("Production");

        // Act
        var response = await factory.CreateClient().GetAsync("/health/live");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(factory.Services.GetService<OpenTelemetry.Trace.TracerProvider>());
    }

    [Fact]
    public void Startup_OtelEnabledByDefault_RegistersTracerProvider()
    {
        // Arrange
        using var factory = CreateFactory(extra: new() { ["OTEL_ENABLED"] = null });

        // Act
        var tracer = factory.Services.GetService<OpenTelemetry.Trace.TracerProvider>();

        // Assert
        Assert.NotNull(tracer);
    }

    [Fact]
    public void HealthChecks_Production_OmitsGrafana()
    {
        // Arrange
        using var factory = CreateFactory("Production");

        // Act
        var names = HealthCheckNames(factory);

        // Assert
        Assert.Contains("Database", names);
        Assert.Contains("AI Service", names);
        Assert.DoesNotContain("Grafana Monitoring", names);
    }

    [Fact]
    public void HealthChecks_Development_KeepsGrafana()
    {
        // Arrange
        using var factory = CreateFactory();

        // Act
        var names = HealthCheckNames(factory);

        // Assert
        Assert.Contains("Grafana Monitoring", names);
    }

    [Fact]
    public void HealthChecks_ProductionWithGrafanaUrl_AddsGrafana()
    {
        // Arrange
        using var factory = CreateFactory("Production", new() { ["Monitoring:GrafanaHealthUrl"] = "http://grafana:3000/api/health" });

        // Act
        var names = HealthCheckNames(factory);

        // Assert
        Assert.Contains("Grafana Monitoring", names);
    }
}
