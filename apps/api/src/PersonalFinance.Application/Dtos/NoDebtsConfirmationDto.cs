namespace PersonalFinance.Application.Dtos;

/// <summary>The owner's "I have no debts" confirmation. ConfirmedAt is null when not confirmed.</summary>
public record NoDebtsConfirmationDto(DateTime? ConfirmedAt);
