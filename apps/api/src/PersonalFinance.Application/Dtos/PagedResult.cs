namespace PersonalFinance.Application.Dtos;

/// <summary>
/// Generic paginated response envelope.
/// </summary>
public class PagedResult<T>
{
    public List<T> Items { get; set; } = [];
    /// <summary>Total rows matching the current filter (not just this page).</summary>
    public int Total { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}
