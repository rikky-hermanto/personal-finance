using FluentValidation;
using MediatR;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Quests;

public class GetQuestBoardQueryHandler(IQuestBoardService board)
    : IRequestHandler<GetQuestBoardQuery, QuestBoardDto>
{
    public Task<QuestBoardDto> Handle(GetQuestBoardQuery request, CancellationToken ct) =>
        board.GetBoardAsync(request.UserId, ct);
}

public class SetQuestFocusCommandHandler(IQuestBoardService board)
    : IRequestHandler<SetQuestFocusCommand, QuestBoardDto>
{
    public Task<QuestBoardDto> Handle(SetQuestFocusCommand request, CancellationToken ct) =>
        board.SetFocusAsync(request.UserId, request.Code, ct);
}

public class SnoozeQuestCommandHandler(IQuestBoardService board)
    : IRequestHandler<SnoozeQuestCommand, QuestBoardDto>
{
    public Task<QuestBoardDto> Handle(SnoozeQuestCommand request, CancellationToken ct) =>
        board.SnoozeAsync(request.UserId, request.Code, ct);
}

public class MarkQuestsSeenCommandHandler(IQuestBoardService board, IValidator<MarkQuestsSeenCommand> validator)
    : IRequestHandler<MarkQuestsSeenCommand>
{
    public async Task Handle(MarkQuestsSeenCommand request, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(request, ct);
        await board.MarkSeenAsync(request.UserId, request.Ids, ct);
    }
}
