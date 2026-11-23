namespace PersonalFinance.Api.Models;

/// <summary>Per-user ceilings on routes that spend LLM quota (PF-157). Bound from AiRateLimit:*.</summary>
public sealed class AiRateLimitOptions
{
    public const string SectionName = "AiRateLimit";

    // Generous for one person: a chat turn is one stream plus one follow-up request, so 20 a minute
    // is about 10 turns, and 500 a day is about 250. Tighten in config if a token leaks.
    public int PerMinute { get; set; } = 20;
    public int PerDay { get; set; } = 500;
    public int MaxConcurrent { get; set; } = 3;
}
