using PersonalFinance.Application.Commands.Quests;
using Xunit;

namespace PersonalFinance.Tests.Quests;

public class MarkQuestsSeenValidatorTests
{
    private static readonly Guid User = Guid.NewGuid();

    [Fact]
    public void MarkSeenValidator_ValidIds_Passes() =>
        Assert.True(new MarkQuestsSeenCommandValidator().Validate(new MarkQuestsSeenCommand(User, [1, 2, 3])).IsValid);

    [Fact]
    public void MarkSeenValidator_Empty_Fails() =>
        Assert.False(new MarkQuestsSeenCommandValidator().Validate(new MarkQuestsSeenCommand(User, [])).IsValid);

    [Fact]
    public void MarkSeenValidator_Oversized_Fails() =>
        Assert.False(new MarkQuestsSeenCommandValidator().Validate(
            new MarkQuestsSeenCommand(User, Enumerable.Range(1, 101).Select(i => (long)i).ToList())).IsValid);

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    public void MarkSeenValidator_NonPositive_Fails(long id) =>
        Assert.False(new MarkQuestsSeenCommandValidator().Validate(new MarkQuestsSeenCommand(User, [id])).IsValid);
}
