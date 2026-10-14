using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Authentication;

public sealed record CashflowPilotMode(bool Enabled) : ICashflowPilotMode;
