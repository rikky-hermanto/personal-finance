using MediatR;
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Commands.Quests;

// UserId always comes from ICurrentUser in the controller, never from a request body.
public record GetQuestBoardQuery(Guid UserId) : IRequest<QuestBoardDto>;
public record SetQuestFocusCommand(Guid UserId, string Code) : IRequest<QuestBoardDto>;
public record SnoozeQuestCommand(Guid UserId, string Code) : IRequest<QuestBoardDto>;
public record MarkQuestsSeenCommand(Guid UserId, IReadOnlyList<long> Ids) : IRequest;
