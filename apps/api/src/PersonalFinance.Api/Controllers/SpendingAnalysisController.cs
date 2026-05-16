using Microsoft.AspNetCore.Mvc;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/spending-analysis")]
public class SpendingAnalysisController(ISpendingAnalysisService _service) : ControllerBase
{
    [HttpGet("safe-to-spend")]
    public async Task<IActionResult> GetSafeToSpend([FromQuery] string? wallet)
        => Ok(await _service.GetSafeToSpendAsync(wallet));

    [HttpGet("variance")]
    public async Task<IActionResult> GetVariance([FromQuery] string? wallet)
        => Ok(await _service.GetVarianceExplainerAsync(wallet));
}
