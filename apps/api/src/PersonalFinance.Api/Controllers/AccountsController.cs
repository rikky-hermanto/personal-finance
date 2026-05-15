using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Application.Commands.Institutions;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AccountsController(IMediator mediator, Supabase.Client supabase) : ControllerBase
{
    // ── Institutions ──────────────────────────────────────────────────────────

    [HttpGet("institutions")]
    public async Task<IActionResult> GetInstitutions()
    {
        var result = await supabase.From<Institution>().Order("name", Ordering.Ascending).Get();
        var dtos = result.Models.Select(i => new InstitutionDto(i.Id, i.Name, i.Type, i.Country, i.LogoUrl));
        return Ok(dtos);
    }

    [HttpPost("institutions")]
    public async Task<IActionResult> CreateInstitution(CreateInstitutionCommand command)
    {
        var created = await mediator.Send(command);
        return Ok(new InstitutionDto(created.Id, created.Name, created.Type, created.Country, created.LogoUrl));
    }

    [HttpPut("institutions/{id:guid}")]
    public async Task<IActionResult> UpdateInstitution(Guid id, UpdateInstitutionCommand command)
    {
        var updated = await mediator.Send(command with { Id = id });
        if (updated == null) return NotFound();
        return Ok(new InstitutionDto(updated.Id, updated.Name, updated.Type, updated.Country, updated.LogoUrl));
    }

    [HttpDelete("institutions/{id:guid}")]
    public async Task<IActionResult> DeleteInstitution(Guid id)
    {
        var deleted = await mediator.Send(new DeleteInstitutionCommand(id));
        if (!deleted) return NotFound();
        return Ok();
    }

    // ── Accounts ──────────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetAccounts()
    {
        var result = await supabase.From<Account>().Order("name", Ordering.Ascending).Get();
        var dtos = result.Models.Select(a => ToDto(a));
        return Ok(dtos);
    }

    [HttpPost]
    public async Task<IActionResult> CreateAccount(CreateAccountCommand command)
    {
        var created = await mediator.Send(command);
        return Ok(ToDto(created));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateAccount(Guid id, UpdateAccountCommand command)
    {
        var updated = await mediator.Send(command with { Id = id });
        if (updated == null) return NotFound();
        return Ok(ToDto(updated));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAccount(Guid id)
    {
        var deleted = await mediator.Send(new DeleteAccountCommand(id));
        if (!deleted) return NotFound();
        return Ok();
    }

    private static AccountDto ToDto(Account a) => new(
        a.Id,
        a.InstitutionId,
        a.Name,
        a.AccountType,
        a.Currency,
        a.OpeningBalance,
        DateOnly.FromDateTime(a.OpeningDate),
        a.IsActive,
        a.Color,
        a.Icon
    );
}
