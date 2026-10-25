using MediatR;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Assets;

public record DeleteAssetCommand(Guid Id) : IRequest<bool>, IAffectsJourney;
