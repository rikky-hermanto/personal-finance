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

    [HttpGet("balances")]
    public async Task<IActionResult> GetAccountBalances()
    {
        var accounts = await supabase.From<Account>()
            .Filter("is_active", Operator.Equals, "true")
            .Filter("include_in_cashflow", Operator.Equals, "true")
            .Order("name", Ordering.Ascending)
            .Get();

        if (!accounts.Models.Any())
            return Ok(Array.Empty<AccountBalanceDto>());

        var txResult = await supabase.From<Transaction>()
            .Select("account_id,flow,amount_idr,date")
            .Get();

        var txByAccount = txResult.Models
            .Where(t => t.AccountId.HasValue)
            .GroupBy(t => t.AccountId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var institutions = await supabase.From<Institution>().Get();
        var instMap = institutions.Models.ToDictionary(i => i.Id, i => i.Name);

        var balances = accounts.Models.Select(a =>
        {
            var txs = txByAccount.GetValueOrDefault(a.Id, []);
            var totalCR = txs.Where(t => t.Flow == "CR").Sum(t => t.AmountIdr);
            var totalDB = txs.Where(t => t.Flow == "DB").Sum(t => t.AmountIdr);
            var asOf = txs.Any() ? txs.Max(t => t.Date) : a.OpeningDate;
            return new AccountBalanceDto(
                a.Id,
                a.Name,
                a.InstitutionId.HasValue ? instMap.GetValueOrDefault(a.InstitutionId.Value, "") : "",
                a.Currency,
                a.OpeningBalance,
                a.OpeningBalance + totalCR - totalDB,
                asOf
            );
        });

        return Ok(balances);
    }

    [HttpPatch("{id:guid}/cashflow")]
    public async Task<IActionResult> SetCashflowFlag(Guid id, [FromBody] bool include)
    {
        var existing = await supabase.From<Account>()
            .Filter("id", Supabase.Postgrest.Constants.Operator.Equals, id.ToString())
            .Single();
        if (existing == null) return NotFound();

        await supabase.From<Account>()
            .Filter("id", Supabase.Postgrest.Constants.Operator.Equals, id.ToString())
            .Set(x => x.IncludeInCashflow, include)
            .Set(x => x.UpdatedAt, DateTime.UtcNow)
            .Update();

        existing.IncludeInCashflow = include;
        return Ok(ToDto(existing));
    }

    [HttpPatch("{id:guid}/opening-balance")]
    public async Task<IActionResult> SetOpeningBalance(Guid id, [FromBody] SetOpeningBalanceRequest req)
    {
        var existing = await supabase.From<Account>()
            .Filter("id", Supabase.Postgrest.Constants.Operator.Equals, id.ToString())
            .Single();
        if (existing == null) return NotFound();

        await supabase.From<Account>()
            .Filter("id", Supabase.Postgrest.Constants.Operator.Equals, id.ToString())
            .Set(x => x.OpeningBalance, req.OpeningBalance)
            .Set(x => x.OpeningDate, req.OpeningDate.ToDateTime(TimeOnly.MinValue))
            .Set(x => x.UpdatedAt, DateTime.UtcNow)
            .Update();

        existing.OpeningBalance = req.OpeningBalance;
        existing.OpeningDate = req.OpeningDate.ToDateTime(TimeOnly.MinValue);
        return Ok(ToDto(existing));
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
        a.IncludeInCashflow,
        a.Color,
        a.Icon
    );
}

public record SetOpeningBalanceRequest(decimal OpeningBalance, DateOnly OpeningDate);
