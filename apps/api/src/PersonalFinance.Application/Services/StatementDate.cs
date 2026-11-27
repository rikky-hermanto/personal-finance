namespace PersonalFinance.Application.Services;

/// <summary>
/// The stored convention for <c>transactions.date</c>: the statement's own clock time, marked UTC
/// (the parsers and TransactionPipelineService write it that way). supabase-csharp reads a
/// timestamptz back converted to the host's local time, often with Kind Unspecified, so on a
/// UTC+8 host 2026-03-31T23:30:00+00:00 arrives as 2026-04-01T07:30 and lands in the wrong month.
/// <see cref="FromSdk"/> undoes that conversion so the date matches the statement on any host.
/// </summary>
public static class StatementDate
{
    /// <summary>Utc is kept; Unspecified is treated as host-local (what the SDK produced) and, like
    /// Local, converted back to UTC.</summary>
    public static DateTime FromSdk(DateTime date)
    {
        if (date.Kind == DateTimeKind.Utc) return date;
        var local = date.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(date, DateTimeKind.Local)
            : date;
        return local.ToUniversalTime();
    }
}
