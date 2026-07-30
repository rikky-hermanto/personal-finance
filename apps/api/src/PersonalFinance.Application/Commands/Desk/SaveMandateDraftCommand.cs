using MediatR;
using PersonalFinance.Application.Dtos.Desk;

namespace PersonalFinance.Application.Commands.Desk;

public record SaveMandateDraftCommand(
    MandateParamsDto Params,
    string? Preset,
    DateOnly? EffectiveDate,
    string? ChangeReason
) : IRequest<DeskMandateVersionDto>;
