using PersonalFinance.Application.Goals;

namespace PersonalFinance.Application.Interfaces;

/// <summary>The inputs and the page-level result of one foundation check. The inputs are kept so the list
/// handler can run FoundationGate.ForGoal per goal on the same snapshot.</summary>
public sealed record FoundationResult(FoundationInputs Inputs, FoundationCheck Check);

/// <summary>Builds the Big Purchases foundation check from one read-only scoring snapshot (PF-154).</summary>
public interface IFoundationCheckService
{
    /// <summary>Never fails open: a load error returns State "not_evaluated" with Missing ["computation_error"].</summary>
    Task<FoundationResult> EvaluateAsync(Guid userId, CancellationToken ct = default);
}
