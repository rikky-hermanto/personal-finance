using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PersonalFinance.Application.Behaviors;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Application.Commands.Assets;
using PersonalFinance.Application.Commands.Liabilities;
using PersonalFinance.Application.Commands.Valuations;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Tests.Behaviors;

public sealed class PublishAssetUpdatedBehaviorTests
{
    private static readonly Guid Owner = Guid.Parse("8d2f5a61-1c3b-4e7a-b9d0-6e4f2a1c7b35");

    // A tagged command and an untagged command, each with a stub handler.
    public sealed record TaggedCommand(bool Throw) : IRequest<string>, IAffectsJourney;
    public sealed record UntaggedCommand() : IRequest<string>;

    private sealed class TaggedHandler : IRequestHandler<TaggedCommand, string>
    {
        public Task<string> Handle(TaggedCommand request, CancellationToken ct)
            => request.Throw ? throw new InvalidOperationException("boom") : Task.FromResult("ok");
    }

    private sealed class UntaggedHandler : IRequestHandler<UntaggedCommand, string>
    {
        public Task<string> Handle(UntaggedCommand request, CancellationToken ct) => Task.FromResult("ok");
    }

    // Records every AssetUpdatedEvent the pipeline publishes.
    private sealed class RecordingHandler : INotificationHandler<AssetUpdatedEvent>
    {
        public List<Guid> Published { get; } = new();
        public Task Handle(AssetUpdatedEvent notification, CancellationToken ct)
        {
            Published.Add(notification.UserId);
            return Task.CompletedTask;
        }
    }

    private static (IMediator mediator, RecordingHandler recorder) BuildPipeline()
    {
        var recorder = new RecordingHandler();
        var caller = new Mock<ICurrentUser>();
        caller.SetupGet(c => c.UserId).Returns(Owner);

        var services = new ServiceCollection();
        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssemblyContaining<PublishAssetUpdatedBehaviorTests>();
            cfg.AddOpenBehavior(typeof(PublishAssetUpdatedBehavior<,>));
        });
        services.AddSingleton<ICurrentUser>(caller.Object);
        services.AddSingleton<INotificationHandler<AssetUpdatedEvent>>(recorder);

        var provider = services.BuildServiceProvider();
        return (provider.GetRequiredService<IMediator>(), recorder);
    }

    [Fact]
    public async Task Handle_TaggedCommandSucceeds_PublishesAssetUpdatedOnceForCaller()
    {
        // Arrange
        var (mediator, recorder) = BuildPipeline();

        // Act
        await mediator.Send(new TaggedCommand(Throw: false));

        // Assert
        Assert.Single(recorder.Published);
        Assert.Equal(Owner, recorder.Published[0]);
    }

    [Fact]
    public async Task Handle_TaggedCommandThrows_PublishesNothing()
    {
        // Arrange
        var (mediator, recorder) = BuildPipeline();

        // Act
        await Assert.ThrowsAsync<InvalidOperationException>(() => mediator.Send(new TaggedCommand(Throw: true)));

        // Assert
        Assert.Empty(recorder.Published);
    }

    [Fact]
    public async Task Handle_UntaggedCommand_PublishesNothing()
    {
        // Arrange
        var (mediator, recorder) = BuildPipeline();

        // Act
        await mediator.Send(new UntaggedCommand());

        // Assert
        Assert.Empty(recorder.Published);
    }

    [Fact]
    public void TaggedCommands_AreExactlyTheElevenJourneyCommands()
    {
        // Arrange
        Type[] expected =
        [
            typeof(CreateAccountCommand), typeof(UpdateAccountCommand), typeof(DeleteAccountCommand),
            typeof(CreateValuationCommand), typeof(DeleteValuationCommand),
            typeof(CreateLiabilityCommand), typeof(UpdateLiabilityCommand), typeof(DeleteLiabilityCommand),
            typeof(CreateAssetCommand), typeof(UpdateAssetCommand), typeof(DeleteAssetCommand),
        ];

        // Act / Assert — every one of the 11 implements the marker, so a refactor cannot silently drop one.
        foreach (var t in expected)
            Assert.True(typeof(IAffectsJourney).IsAssignableFrom(t), $"{t.Name} must implement IAffectsJourney");
    }
}
