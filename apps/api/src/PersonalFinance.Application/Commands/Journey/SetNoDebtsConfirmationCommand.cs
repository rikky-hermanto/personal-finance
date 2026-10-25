using MediatR;
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Commands.Journey;

public record SetNoDebtsConfirmationCommand(Guid UserId, bool Confirmed) : IRequest<NoDebtsConfirmationDto>;
