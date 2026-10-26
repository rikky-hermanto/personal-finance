using PersonalFinance.Application.Services;

namespace PersonalFinance.Tests.Services;

/// <summary>
/// PF-152 STEP 7: "today" must be the calendar day in Asia/Jakarta, not the host's UTC clock.
/// The subclass overrides GetUtcNow() so no fake-time package is needed.
/// </summary>
public class AppTimeProviderTests
{
    private sealed class PinnedTimeProvider(TimeZoneInfo zone, DateTimeOffset utcNow) : AppTimeProvider(zone)
    {
        private readonly DateTimeOffset _utcNow = utcNow;
        public override DateTimeOffset GetUtcNow() => _utcNow;
    }

    private static readonly TimeZoneInfo Jakarta =
        TimeZoneInfo.CreateCustomTimeZone("WIB", TimeSpan.FromHours(7), "WIB", "WIB");

    [Fact]
    public void LocalNow_AtUtcMidnightCrossing_IsAlreadyNextDayInJakarta()
    {
        // 2026-10-31 18:00 UTC is 2026-11-01 01:00 in Jakarta (+7).
        var provider = new PinnedTimeProvider(Jakarta, new DateTimeOffset(2026, 10, 31, 18, 0, 0, TimeSpan.Zero));

        var today = DateOnly.FromDateTime(provider.GetLocalNow().DateTime);

        Assert.Equal(new DateOnly(2026, 11, 1), today);
    }

    [Fact]
    public void LocalNow_JustBeforeTheCrossing_IsStillTheSameDay()
    {
        // 2026-10-31 16:59 UTC is 2026-10-31 23:59 in Jakarta — still October 31.
        var provider = new PinnedTimeProvider(Jakarta, new DateTimeOffset(2026, 10, 31, 16, 59, 0, TimeSpan.Zero));

        var today = DateOnly.FromDateTime(provider.GetLocalNow().DateTime);

        Assert.Equal(new DateOnly(2026, 10, 31), today);
    }

    [Fact]
    public void Jakarta_ResolvesToSevenHourOffset()
    {
        var provider = AppTimeProvider.Jakarta();

        Assert.Equal(TimeSpan.FromHours(7), provider.LocalTimeZone.GetUtcOffset(new DateTime(2026, 10, 26)));
    }
}
