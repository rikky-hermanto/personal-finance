using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands.MacroScenarios;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/macro-scenarios")]
public class MacroScenariosController(
    IMediator mediator,
    IMacroScenarioService macroScenarioService
) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var scenarios = await macroScenarioService.GetAllAsync(ct);
        return Ok(scenarios.Select(ToDto));
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateMacroScenarioCommand command)
    {
        var created = await mediator.Send(command);
        return Ok(ToDto(created));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var deleted = await mediator.Send(new DeleteMacroScenarioCommand(id));
        if (!deleted) return NotFound();
        return Ok();
    }

    private static MacroScenarioDto ToDto(MacroScenario s) => new(
        s.Id, s.Name, s.DriversJson, s.CreatedAt, s.UpdatedAt
    );
}
