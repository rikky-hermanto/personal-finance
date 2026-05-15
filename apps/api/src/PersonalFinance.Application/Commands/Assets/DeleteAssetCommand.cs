using MediatR;

namespace PersonalFinance.Application.Commands.Assets;

public record DeleteAssetCommand(Guid Id) : IRequest<bool>;
