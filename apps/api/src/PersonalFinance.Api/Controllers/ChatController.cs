using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

/// <summary>
/// AI chat over the caller's own transactions (PF-S15). The browser never calls the AI
/// service; this controller forwards for the verified caller. Closed unless AiChat:Enabled.
/// </summary>
[ApiController]
[Authorize]
[Route("api/chat")]
public class ChatController(IAiChatClient chat, IConfiguration configuration) : ControllerBase
{
    private bool Enabled => configuration.GetValue<bool>("AiChat:Enabled");

    // Phase 2 agents reopen separately, after the AI service's AI_AGENTS_ENABLED.
    private bool AgentsEnabled => Enabled && configuration.GetValue<bool>("AiChat:AgentsEnabled");

    [HttpPost("ask/stream")]
    public async Task<IActionResult> AskStream([FromBody] AskChatRequest request)
    {
        if (!Enabled) return NotFound();

        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
        try
        {
            // RequestAborted: closing the tab cancels the upstream FastAPI request too.
            await chat.StreamAskAsync(request, Response.Body, HttpContext.RequestAborted);
        }
        catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested) { }
        return new EmptyResult();
    }

    [HttpPost("followups")]
    public async Task<IActionResult> FollowUps([FromBody] FollowUpChatRequest request)
    {
        if (!Enabled) return NotFound();
        var questions = await chat.FollowUpsAsync(request, HttpContext.RequestAborted);
        return Ok(new { Questions = questions });
    }

    [HttpPost("advisor")]
    public async Task<IActionResult> Advisor([FromBody] AdvisorChatRequest request)
    {
        if (!AgentsEnabled) return NotFound();
        return Ok(await chat.AdvisorAsync(request, HttpContext.RequestAborted));
    }
}
