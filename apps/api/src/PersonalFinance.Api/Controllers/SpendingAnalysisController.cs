using Microsoft.AspNetCore.Mvc;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/spending-analysis")]
public class SpendingAnalysisController(ISpendingAnalysisService _service) : ControllerBase
{
    [HttpGet("safe-to-spend")]
    public async Task<IActionResult> GetSafeToSpend([FromQuery] Guid? accountId = null)
        => Ok(await _service.GetSafeToSpendAsync(accountId));

    [HttpGet("variance")]
    public async Task<IActionResult> GetVariance([FromQuery] Guid? accountId = null)
        => Ok(await _service.GetVarianceExplainerAsync(accountId));
}
