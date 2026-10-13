namespace PersonalFinance.Application.Dtos;

public sealed record CashflowImportResult(
    IReadOnlyList<int> InsertedIds,
    int InsertedCount,
    int DuplicateCount);

public sealed record CashflowRuleCreateResult(int Id, bool Created);

public enum CashflowMutationFailure
{
    InvalidInput,
    AccountUnavailable,
    InstitutionUnavailable,
    AccountInUse,
    RuleExists,
    IdempotencyConflict,
    FileAlreadyProcessed,
    ConstraintConflict,
    Retryable,
    BackendFailure
}

public sealed class CashflowMutationException(CashflowMutationFailure failure)
    : Exception($"Cashflow mutation failed: {failure}")
{
    public CashflowMutationFailure Failure { get; } = failure;
}
