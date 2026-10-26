namespace PersonalFinance.Application.Services;

/// <summary>TimeProvider whose local zone is Asia/Jakarta, so "today" and "this month" are the owner's, on any host.
/// Not sealed so tests can subclass and pin GetUtcNow() without a fake-time package.</summary>
public class AppTimeProvider(TimeZoneInfo zone) : TimeProvider
{
    public override TimeZoneInfo LocalTimeZone { get; } = zone;

    public static AppTimeProvider Jakarta() => new(Resolve());

    private static TimeZoneInfo Resolve()
    {
        // IANA id on Linux/macOS (and Windows with ICU); the Windows id as a fallback.
        foreach (var id in new[] { "Asia/Jakarta", "SE Asia Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); } catch (TimeZoneNotFoundException) { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("WIB", TimeSpan.FromHours(7), "WIB", "WIB");  // Indonesia has no DST
    }
}
