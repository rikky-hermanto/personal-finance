using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Application.Commands.Institutions;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.Supabase;

/// <summary>Calls checked PostgREST functions with the verified request JWT.</summary>
public sealed class SupabaseCashflowMutationService(
    HttpClient http, SupabaseSettings settings, ICurrentUser caller)
    : ICashflowMutationService
{
    public async Task<CashflowImportResult> SubmitAsync(
        Guid requestId, IReadOnlyList<TransactionDto> transactions,
        string? fileHash, string? fileName, CancellationToken cancellationToken = default)
    {
        if (requestId == Guid.Empty || transactions.Count is < 1 or > 5000)
            throw new CashflowMutationException(CashflowMutationFailure.InvalidInput);

        var rows = transactions.Select(t => new
        {
            date = t.Date.ToUniversalTime().ToString("O", System.Globalization.CultureInfo.InvariantCulture),
            description = t.Description,
            remarks = t.Remarks,
            flow = t.Flow,
            type = t.Type,
            category = t.Category,
            account_id = t.AccountId,
            account_name = t.AccountName,
            amount_idr = t.AmountIdr,
            currency = t.Currency,
            exchange_rate = t.ExchangeRate,
            statement_balance = t.StatementBalance,
            category_rule = t.CategoryRuleDto is null ? null : new
            {
                keyword = t.CategoryRuleDto.Keyword,
                type = t.CategoryRuleDto.Type,
                flow = t.CategoryRuleDto.Flow
            }
        }).ToArray();
        var payload = new
        {
            p_request_id = requestId,
            p_rows = rows,
            p_file_hash = fileHash,
            p_file_name = fileName
        };
        using var response = await PostAsync("submit_cashflow_import", payload, cancellationToken);
        try
        {
            return await response.Content.ReadFromJsonAsync<CashflowImportResult>(cancellationToken)
                ?? throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        }
        catch (JsonException)
        {
            throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        }
    }

    public async Task<int> ResetAsync(CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("reset_cashflow", new { }, cancellationToken);
        try
        {
            return await response.Content.ReadFromJsonAsync<int>(cancellationToken);
        }
        catch (JsonException)
        {
            throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        }
    }

    public async Task<Guid> CreateAccountAsync(
        CreateAccountCommand command, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("create_cashflow_account", new
        {
            p_institution_id = command.InstitutionId,
            p_name = command.Name,
            p_account_type = command.AccountType,
            p_currency = command.Currency,
            p_opening_balance = command.OpeningBalance,
            p_opening_date = command.OpeningDate,
            p_color = command.Color,
            p_icon = command.Icon
        }, cancellationToken);
        return await ReadIdAsync(response, cancellationToken);
    }

    public async Task<Guid> CreateInstitutionAsync(
        CreateInstitutionCommand command, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("create_cashflow_institution", new
        {
            p_name = command.Name,
            p_type = command.Type,
            p_country = command.Country,
            p_logo_url = command.LogoUrl
        }, cancellationToken);
        return await ReadIdAsync(response, cancellationToken);
    }

    public async Task<bool> UpdateAccountAsync(
        UpdateAccountCommand command, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("update_cashflow_account", new
        {
            p_id = command.Id,
            p_name = command.Name,
            p_account_type = command.AccountType,
            p_currency = command.Currency,
            p_is_active = command.IsActive,
            p_color = command.Color,
            p_icon = command.Icon
        }, cancellationToken);
        return await ReadBoolAsync(response, cancellationToken);
    }

    public async Task<bool> SetAccountCashflowFlagAsync(
        Guid accountId, bool include, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("set_cashflow_account_flag", new
        {
            p_id = accountId, p_include = include
        }, cancellationToken);
        return await ReadBoolAsync(response, cancellationToken);
    }

    public async Task<bool> SetOpeningBalanceAsync(
        Guid accountId, decimal amount, DateOnly openingDate,
        CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("set_cashflow_opening_balance", new
        {
            p_id = accountId, p_opening_balance = amount, p_opening_date = openingDate
        }, cancellationToken);
        return await ReadBoolAsync(response, cancellationToken);
    }

    public async Task<bool> UpdateInstitutionAsync(
        UpdateInstitutionCommand command, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("update_cashflow_institution", new
        {
            p_id = command.Id,
            p_name = command.Name,
            p_type = command.Type,
            p_country = command.Country,
            p_logo_url = command.LogoUrl
        }, cancellationToken);
        return await ReadBoolAsync(response, cancellationToken);
    }

    public async Task<bool> DeleteAccountAsync(
        Guid accountId, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("delete_cashflow_account", new
        {
            p_id = accountId
        }, cancellationToken);
        return await ReadBoolAsync(response, cancellationToken);
    }

    public async Task<bool> DeleteInstitutionAsync(
        Guid institutionId, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("delete_cashflow_institution", new
        {
            p_id = institutionId
        }, cancellationToken);
        return await ReadBoolAsync(response, cancellationToken);
    }

    public async Task<CashflowRuleCreateResult> CreateRuleAsync(
        CategoryRuleDto rule, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("create_cashflow_rule", new
        {
            p_keyword = rule.Keyword,
            p_type = rule.Type,
            p_category = rule.Category,
            p_flow = rule.Flow
        }, cancellationToken);
        try
        {
            return await response.Content.ReadFromJsonAsync<CashflowRuleCreateResult>(cancellationToken)
                ?? throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        }
        catch (JsonException)
        {
            throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        }
    }

    public async Task<bool> UpdateRuleAsync(
        int ruleId, CategoryRuleDto rule, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("update_cashflow_rule", new
        {
            p_id = ruleId,
            p_keyword = rule.Keyword,
            p_type = rule.Type,
            p_category = rule.Category,
            p_flow = rule.Flow
        }, cancellationToken);
        return await ReadBoolAsync(response, cancellationToken);
    }

    public async Task<bool> DeleteRuleAsync(
        int ruleId, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("delete_cashflow_rule", new
        {
            p_id = ruleId
        }, cancellationToken);
        return await ReadBoolAsync(response, cancellationToken);
    }

    public async Task<int> ResetRulesAsync(CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("reset_cashflow_rules", new { }, cancellationToken);
        try
        {
            return await response.Content.ReadFromJsonAsync<int>(cancellationToken);
        }
        catch (JsonException)
        {
            throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        }
    }

    public async Task SetFuturePlanAsync(
        decimal amount, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("set_cashflow_future_plan", new
        {
            p_amount = amount
        }, cancellationToken);
    }

    public async Task DemoteCommittedItemAsync(
        string itemKey, CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("demote_cashflow_committed_item", new
        {
            p_item_key = itemKey
        }, cancellationToken);
    }

    public async Task<decimal> GetLiquidTotalAsync(CancellationToken cancellationToken = default)
    {
        using var response = await PostAsync("get_cashflow_liquid_total", new { }, cancellationToken);
        try
        {
            return await response.Content.ReadFromJsonAsync<decimal>(cancellationToken);
        }
        catch (JsonException)
        {
            throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        }
    }

    private static async Task<bool> ReadBoolAsync(
        HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            return await response.Content.ReadFromJsonAsync<bool>(cancellationToken);
        }
        catch (JsonException)
        {
            throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        }
    }

    private static async Task<Guid> ReadIdAsync(
        HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            var id = await response.Content.ReadFromJsonAsync<Guid>(cancellationToken);
            return id != Guid.Empty ? id : throw new JsonException("Empty ID");
        }
        catch (JsonException)
        {
            throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        }
    }

    private async Task<HttpResponseMessage> PostAsync(
        string function, object payload, CancellationToken cancellationToken)
    {
        _ = caller.UserId;
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"{settings.Url.TrimEnd('/')}/rest/v1/rpc/{function}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", caller.AccessToken);
        request.Headers.Add("apikey", settings.AnonKey);
        request.Content = JsonContent.Create(payload);
        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException)
        {
            throw new CashflowMutationException(CashflowMutationFailure.Retryable);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new CashflowMutationException(CashflowMutationFailure.Retryable);
        }
        if (response.IsSuccessStatusCode) return response;

        using (response)
        {
            string? code = null;
            string? message = null;
            try
            {
                using var error = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
                code = error.RootElement.TryGetProperty("code", out var c) ? c.GetString() : null;
                message = error.RootElement.TryGetProperty("message", out var m) ? m.GetString() : null;
            }
            catch (JsonException) { }
            var failure = (code, message) switch
            {
                ("P0001", "idempotency_conflict") => CashflowMutationFailure.IdempotencyConflict,
                ("P0001", "file_already_processed") => CashflowMutationFailure.FileAlreadyProcessed,
                ("P0001", "account_unavailable") => CashflowMutationFailure.AccountUnavailable,
                ("P0001", "institution_unavailable") => CashflowMutationFailure.InstitutionUnavailable,
                ("P0001", "account_in_use") => CashflowMutationFailure.AccountInUse,
                ("P0001", "rule_exists") => CashflowMutationFailure.RuleExists,
                ("22023", _) or ("22P02", _) or ("22007", _) => CashflowMutationFailure.InvalidInput,
                ("23505", _) => CashflowMutationFailure.ConstraintConflict,
                ("55P03", _) or ("40P01", _) or ("57014", _) => CashflowMutationFailure.Retryable,
                _ => CashflowMutationFailure.BackendFailure
            };
            throw new CashflowMutationException(failure);
        }
    }
}
