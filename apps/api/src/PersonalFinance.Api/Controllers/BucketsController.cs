using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Dtos.Buckets;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/buckets")]
public class BucketsController(IBucketsService _service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetBuckets()
        => Ok(await _service.GetBucketsAsync());

    [HttpGet("month-close")]
    public async Task<IActionResult> GetMonthClose()
        => Ok(await _service.GetMonthCloseAsync());

    [HttpPost("future-plan")]
    public async Task<IActionResult> SetFuturePlan([FromBody] SetFuturePlanRequestDto request)
        => Ok(await _service.SetFuturePlanAsync(request.FutureMonthlyAmount));

    [HttpPost("committed-items/demote")]
    public async Task<IActionResult> DemoteCommittedItem([FromBody] DemoteCommittedItemRequestDto request)
        => Ok(await _service.DemoteCommittedItemAsync(request.ItemKey));
}
