using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using PersonalFinance.Api.Controllers;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Tests.Controllers;

/// <summary>
/// PF-152 STEP 6: SetCashflowFlag must publish exactly one AssetUpdatedEvent after a successful
/// flag change (the flag decides which accounts l1.full_picture waits for) and publish nothing
/// when the account is not found.
///
/// Only the NotFound path is a unit test: it returns before touching Supabase. The success path
/// reads the account back through the concrete Supabase.Client (no interface to mock), so
/// "SetCashflowFlag_Succeeds_PublishesAssetUpdated" is proven live against the running stack —
/// see the Owner Review Checklist (G3), section E.
/// </summary>
public class AccountsControllerJourneyTriggerTests
{
    private static readonly Guid Owner = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [Fact]
    public async Task SetCashflowFlag_NotFound_PublishesNothing()
    {
        // Arrange
        var mediator = new Mock<IMediator>();
        var caller = new Mock<ICurrentUser>();
        caller.SetupGet(c => c.UserId).Returns(Owner);
        var mutations = new Mock<ICashflowMutationService>();
        mutations.Setup(m => m.SetAccountCashflowFlagAsync(It.IsAny<Guid>(), It.IsAny<bool>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        // supabase and transactions are never reached on the NotFound path.
        var controller = new AccountsController(mediator.Object, null!, caller.Object, null!, mutations.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };

        // Act
        var result = await controller.SetCashflowFlag(Guid.NewGuid(), include: true);

        // Assert
        Assert.IsType<NotFoundResult>(result);
        mediator.Verify(m => m.Publish(It.IsAny<AssetUpdatedEvent>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
