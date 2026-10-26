using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Quests;

/// <summary>Everything one scoring pass loaded, plus the indicators computed from it.
/// A null list means that load failed; dependent indicators report "Computation error".</summary>
public sealed record ScoringSnapshot(
    DateOnly Today,
    IReadOnlyList<Transaction>? Transactions,        // 3 months back to the first of the month, through today
    IReadOnlyList<SavingsAccountFact>? SavingsAccounts,
    IReadOnlyList<Liability>? Liabilities,
    DateTime? NoDebtsConfirmedAt,                    // PF-151's confirmation; null = not confirmed
    bool ConfirmationLoaded,                         // false = the read failed, so DTI must fail closed
    IReadOnlyList<IndicatorScoreDto> Indicators);

public sealed record SavingsAccountFact(Guid AccountId, string Name, decimal? LatestValueIdr, DateTime? LatestValuedAt);

public sealed record JourneyRecalculation(JourneyStateDto State, ScoringSnapshot Snapshot);
