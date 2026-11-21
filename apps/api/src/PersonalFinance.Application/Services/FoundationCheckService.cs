using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Goals;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Quests;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Services;

/// <summary>One read-only scoring snapshot plus the goal earmarks, fed into FoundationGate (PF-154).
/// Source: formulas.md §9 "Foundation check". A failure degrades to neutral, never to green (FIN-04).</summary>
public class FoundationCheckService(
    IJourneyScoringService scoring,
    IGoalService goals,
    ILogger<FoundationCheckService> logger
) : IFoundationCheckService
{
    internal const string ComputationError = "computation_error";

    public async Task<FoundationResult> EvaluateAsync(Guid userId, CancellationToken ct = default)
    {
        try
        {
            var s = await scoring.LoadSnapshotAsync(userId, ct);

            var spend = s.Indicators.FirstOrDefault(i => i.Code == "spend_lt_income");
            var cover = s.Indicators.FirstOrDefault(i => i.Code == "liquid_savings_ratio");
            var dti = s.Indicators.FirstOrDefault(i => i.Code == "manageable_dti");

            var savingsFresh = s.SavingsAccounts is { } a && ValuationFreshness.AllFresh(a, s.Today);
            var liquidTotal = s.SavingsAccounts?.Sum(x => x.LatestValueIdr ?? 0m) ?? 0m;

            var months = JourneyScoringService.MonthsBack(s.Today);
            var transactions = s.Transactions ?? Array.Empty<Transaction>();
            var avgConsumption = JourneyScoringRules.AverageMonthlyConsumption(transactions, months);
            var avgIncome = JourneyScoringRules.AverageMonthlyIncome(transactions, months);
            // Only read when the DTI indicator is evaluated, which already guarantees every payment is known.
            var debtService = s.Liabilities?.Sum(l => l.MonthlyPayment ?? 0m) ?? 0m;

            var savingsIds = s.SavingsAccounts?.Select(x => x.AccountId).ToList() ?? [];
            var earmarked = await goals.EarmarkedInAccountsAsync(savingsIds, ct);

            var inputs = new FoundationInputs(spend, cover, dti, savingsFresh, liquidTotal, avgConsumption,
                earmarked, avgIncome, debtService);
            return new FoundationResult(inputs, FoundationGate.Evaluate(inputs));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Foundation check failed for user {UserId}; reporting not evaluated", userId);
            var inputs = new FoundationInputs(null, null, null, false, 0m, 0m, 0m, 0m, 0m);
            var check = new FoundationCheck("not_evaluated", null, 0m, null, [], [ComputationError]);
            return new FoundationResult(inputs, check);
        }
    }
}
