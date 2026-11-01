using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class NetWorthController(INetWorthService netWorthService) : ControllerBase
{
    [HttpGet("current")]
    public async Task<IActionResult> GetCurrent(CancellationToken ct)
    {
        var summary = await netWorthService.GetCurrentAsync(ct);
        return Ok(summary);
    }

    [HttpGet("allocation")]
    public async Task<IActionResult> GetAllocation(CancellationToken ct)
    {
        var allocation = await netWorthService.GetAllocationByClassAsync(ct);
        return Ok(allocation);
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default)
    {
        var fromDate = from ?? DateTime.UtcNow.AddMonths(-12);
        var toDate = to ?? DateTime.UtcNow;

        var history = await netWorthService.GetHistoryAsync(fromDate, toDate, ct);
        return Ok(history);
    }
}
