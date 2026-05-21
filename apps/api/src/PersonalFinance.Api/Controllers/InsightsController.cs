using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InsightsController(IInsightService insightService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<InsightDto>>> GetInsights(CancellationToken ct) =>
        Ok(await insightService.GetInsightsAsync(ct));

    [HttpGet("daily-pulse")]
    public async Task<ActionResult<DailyPulseDto>> GetDailyPulse(CancellationToken ct) =>
        Ok(await insightService.GetDailyPulseAsync(ct));
}
