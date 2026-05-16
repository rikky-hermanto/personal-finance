using MediatR;
using PersonalFinance.Application.Dtos;

public record RecalculateJourneyCommand(Guid UserId) : IRequest<JourneyStateDto>;
