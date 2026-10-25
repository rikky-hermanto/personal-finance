namespace PersonalFinance.Application.Interfaces;

public interface IJourneyConfirmationService
{
    /// <summary>When the owner confirmed "I have no debts", or null when not confirmed.</summary>
    Task<DateTime?> GetNoDebtsConfirmedAtAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Sets the confirmation time, or clears it when <paramref name="confirmedAt"/> is null.</summary>
    Task SetNoDebtsConfirmedAtAsync(Guid userId, DateTime? confirmedAt, CancellationToken ct = default);
}
