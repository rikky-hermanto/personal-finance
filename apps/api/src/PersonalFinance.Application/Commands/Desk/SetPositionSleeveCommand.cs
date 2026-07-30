using MediatR;
using PersonalFinance.Application.Dtos.Desk;

namespace PersonalFinance.Application.Commands.Desk;

public record SetPositionSleeveCommand(
    Guid PositionId,
    string Sleeve
) : IRequest<DeskPositionDto>;
