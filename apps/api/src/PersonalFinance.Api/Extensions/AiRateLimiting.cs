using System.Globalization;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Models;

namespace PersonalFinance.Api.Extensions;

/// <summary>
/// Per-user limits on the routes that spend LLM quota (PF-157). Counters live in memory, so each API
/// instance counts alone; the deployment runs one instance (--max-instances=1). A user's limits are
/// read when their bucket is first created, so a config change applies to buckets created after it.
/// </summary>
public static class AiRateLimiting
{
    public const string RejectedCode = "rate_limited";

    public static IServiceCollection AddAiRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AiRateLimitOptions>(configuration.GetSection(AiRateLimitOptions.SectionName));
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.CreateChained(
                FixedWindow(TimeSpan.FromMinutes(1), o => o.PerMinute),
                FixedWindow(TimeSpan.FromDays(1), o => o.PerDay),
                Concurrency());
            options.OnRejected = WriteRejectionAsync;
        });
        return services;
    }

    /// <summary>Chat and advisor calls, and the portfolio review: every route that ends in an LLM call a user can repeat.</summary>
    public static bool IsAiSpendingRoute(HttpRequest request) =>
        request.Path.StartsWithSegments("/api/chat") ||
        (HttpMethods.IsPost(request.Method) &&
         request.Path.StartsWithSegments("/api/investments") &&
         request.Path.Value!.EndsWith("/review", StringComparison.OrdinalIgnoreCase));

    /// <summary>The verified user, or the remote address when there is none. Anonymous floods share one
    /// bucket, so they can never use up a signed-in user's allowance.</summary>
    public static string PartitionKey(HttpContext context) =>
        context.User.FindFirstValue("sub") is { Length: > 0 } subject
            ? $"user:{subject}"
            : $"ip:{context.Connection.RemoteIpAddress}";

    private static AiRateLimitOptions Limits(HttpContext context) =>
        context.RequestServices.GetRequiredService<IOptions<AiRateLimitOptions>>().Value;

    private static PartitionedRateLimiter<HttpContext> FixedWindow(TimeSpan window, Func<AiRateLimitOptions, int> permits) =>
        PartitionedRateLimiter.Create<HttpContext, string>(context =>
            !IsAiSpendingRoute(context.Request)
                ? RateLimitPartition.GetNoLimiter("other")
                : RateLimitPartition.GetFixedWindowLimiter(PartitionKey(context), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = permits(Limits(context)),
                    Window = window,
                    QueueLimit = 0,
                    AutoReplenishment = true,
                }));

    private static PartitionedRateLimiter<HttpContext> Concurrency() =>
        PartitionedRateLimiter.Create<HttpContext, string>(context =>
            !IsAiSpendingRoute(context.Request)
                ? RateLimitPartition.GetNoLimiter("other")
                : RateLimitPartition.GetConcurrencyLimiter(PartitionKey(context), _ => new ConcurrencyLimiterOptions
                {
                    PermitLimit = Limits(context).MaxConcurrent,
                    QueueLimit = 0,
                }));

    private static async ValueTask WriteRejectionAsync(OnRejectedContext context, CancellationToken ct)
    {
        var http = context.HttpContext;
        var seconds = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
            ? Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds))
            : 5;
        http.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        http.Response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
        // Path only: the user id stays out of the log line.
        http.RequestServices.GetRequiredService<ILoggerFactory>()
            .CreateLogger("AiRateLimiting")
            .LogWarning("AI rate limit reached on {Path}", http.Request.Path);
        await http.Response.WriteAsJsonAsync(new { code = RejectedCode }, ct);
    }
}
