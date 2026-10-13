using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Application.Commands.Institutions;

namespace PersonalFinance.Application.Interfaces;

public interface ICashflowMutationService
{
    Task<CashflowImportResult> SubmitAsync(
        Guid requestId, IReadOnlyList<TransactionDto> transactions,
        string? fileHash, string? fileName, CancellationToken cancellationToken = default);

    Task<int> ResetAsync(CancellationToken cancellationToken = default);

    Task<Guid> CreateAccountAsync(
        CreateAccountCommand command, CancellationToken cancellationToken = default);

    Task<Guid> CreateInstitutionAsync(
        CreateInstitutionCommand command, CancellationToken cancellationToken = default);

    Task<bool> UpdateAccountAsync(
        UpdateAccountCommand command, CancellationToken cancellationToken = default);

    Task<bool> SetAccountCashflowFlagAsync(
        Guid accountId, bool include, CancellationToken cancellationToken = default);

    Task<bool> SetOpeningBalanceAsync(
        Guid accountId, decimal amount, DateOnly openingDate,
        CancellationToken cancellationToken = default);

    Task<bool> UpdateInstitutionAsync(
        UpdateInstitutionCommand command, CancellationToken cancellationToken = default);

    Task<bool> DeleteAccountAsync(
        Guid accountId, CancellationToken cancellationToken = default);

    Task<bool> DeleteInstitutionAsync(
        Guid institutionId, CancellationToken cancellationToken = default);

    Task<CashflowRuleCreateResult> CreateRuleAsync(
        CategoryRuleDto rule, CancellationToken cancellationToken = default);

    Task<bool> UpdateRuleAsync(
        int ruleId, CategoryRuleDto rule, CancellationToken cancellationToken = default);

    Task<bool> DeleteRuleAsync(
        int ruleId, CancellationToken cancellationToken = default);

    Task<int> ResetRulesAsync(CancellationToken cancellationToken = default);

    Task SetFuturePlanAsync(decimal amount, CancellationToken cancellationToken = default);

    Task DemoteCommittedItemAsync(string itemKey, CancellationToken cancellationToken = default);

    Task<decimal> GetLiquidTotalAsync(CancellationToken cancellationToken = default);
}
