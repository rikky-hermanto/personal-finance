using MediatR;

namespace PersonalFinance.Application.Commands
{
    public record DeleteAllTransactionsCommand : IRequest<int>;
}
