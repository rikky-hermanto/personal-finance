using MediatR;
using PersonalFinance.Domain.Entities;

public record CreateTransactionCommand(Transaction Transaction) : IRequest<Transaction>;