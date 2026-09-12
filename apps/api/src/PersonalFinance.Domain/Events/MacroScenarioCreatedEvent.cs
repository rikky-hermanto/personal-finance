using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Domain.Events;

public record MacroScenarioCreatedEvent(MacroScenario Scenario) : INotification;
