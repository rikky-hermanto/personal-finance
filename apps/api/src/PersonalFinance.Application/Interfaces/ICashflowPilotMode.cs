namespace PersonalFinance.Application.Interfaces;

/// <summary>Whether the owner-scoped Cashflow pilot is serving traffic.</summary>
public interface ICashflowPilotMode
{
    bool Enabled { get; }
}
