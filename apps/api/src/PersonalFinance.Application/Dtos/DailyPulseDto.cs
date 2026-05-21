namespace PersonalFinance.Application.Dtos;

public record DailyPulseDto(
    string Headline,
    string Tone,           // positive | neutral | caution
    decimal MonthProgress, // 0.0 – 1.0 (day of month / days in month)
    decimal? PaceVsBaseline // e.g. -0.12 = 12% below avg mid-month spending
);
