using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Validation;
using static PersonalFinance.Tests.Goals.GoalTestSupport;

namespace PersonalFinance.Tests.Goals;

public class GoalValidatorTests
{
    private static readonly CreateGoalCommandValidator Create = new(new FixedTime());
    private static readonly UpdateGoalCommandValidator Update = new();
    private static readonly AddGoalContributionCommandValidator Add = new(new FixedTime());
    private static readonly ReplaceGoalCostItemsCommandValidator Costs = new();
    private static readonly PreviewGoalQueryValidator Preview = new();
    private static readonly GetGoalsQueryValidator List = new();

    private static CreateGoalCommand ValidCreate() =>
        new("vehicle", "Test vehicle", null, 2, 200_000_000m, new DateOnly(2028, 11, 30), null, null);

    private static UpdateGoalCommand ValidUpdate() =>
        new(Guid.NewGuid(), "vehicle", "Test vehicle", null, 2, 200_000_000m, new DateOnly(2026, 1, 31), null, null, "paused");

    [Fact]
    public void Create_ValidCommand_Passes() => Assert.True(Create.Validate(ValidCreate()).IsValid);

    [Theory]
    [InlineData("house_land", true)]
    [InlineData("vehicle", true)]
    [InlineData("education", true)]
    [InlineData("wedding", true)]
    [InlineData("other", true)]
    [InlineData("holiday", false)]
    public void Create_Category_OnlyBigPurchaseCategories(string category, bool valid) =>
        Assert.Equal(valid, Create.Validate(ValidCreate() with { Category = category }).IsValid);

    [Theory]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("A", true)]
    public void Create_Name_OneCharacterAfterTrim(string name, bool valid) =>
        Assert.Equal(valid, Create.Validate(ValidCreate() with { Name = name }).IsValid);

    [Fact]
    public void Create_Name121Characters_Fails()
    {
        Assert.True(Create.Validate(ValidCreate() with { Name = new string('a', 120) }).IsValid);
        Assert.False(Create.Validate(ValidCreate() with { Name = new string('a', 121) }).IsValid);
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(4, true)]
    [InlineData(5, false)]
    public void Create_Priority_OneToFour(short priority, bool valid) =>
        Assert.Equal(valid, Create.Validate(ValidCreate() with { Priority = priority }).IsValid);

    [Fact]
    public void Create_TargetAmount_AboveZeroBelowNumericBound()
    {
        Assert.False(Create.Validate(ValidCreate() with { TargetAmount = 0m }).IsValid);
        Assert.True(Create.Validate(ValidCreate() with { TargetAmount = 0.01m }).IsValid);
        Assert.True(Create.Validate(ValidCreate() with { TargetAmount = 999_999_999_999_999_999.99m }).IsValid);
        Assert.False(Create.Validate(ValidCreate() with { TargetAmount = 1_000_000_000_000_000_000m }).IsValid);
    }

    [Fact]
    public void Create_TargetDate_TodayOkYesterdayFails()
    {
        Assert.True(Create.Validate(ValidCreate() with { TargetDate = Today }).IsValid);
        Assert.False(Create.Validate(ValidCreate() with { TargetDate = Today.AddDays(-1) }).IsValid);
        Assert.True(Create.Validate(ValidCreate() with { TargetDate = null }).IsValid);
    }

    [Fact]
    public void Create_GrowthAndInstalment_Bounds()
    {
        Assert.True(Create.Validate(ValidCreate() with { PriceGrowthRate = 0m }).IsValid);
        Assert.True(Create.Validate(ValidCreate() with { PriceGrowthRate = 1m }).IsValid);
        Assert.False(Create.Validate(ValidCreate() with { PriceGrowthRate = 1.01m }).IsValid);
        Assert.False(Create.Validate(ValidCreate() with { PriceGrowthRate = -0.01m }).IsValid);
        Assert.True(Create.Validate(ValidCreate() with { PlannedMonthlyInstalment = 0m }).IsValid);
        Assert.False(Create.Validate(ValidCreate() with { PlannedMonthlyInstalment = -1m }).IsValid);
    }

    [Fact]
    public void Update_PastDate_AllowedOnUpdate() => Assert.True(Update.Validate(ValidUpdate()).IsValid);

    [Theory]
    [InlineData("active", true)]
    [InlineData("achieved", true)]
    [InlineData("cancelled", true)]
    [InlineData("deleted", false)]
    public void Update_Status_OnlyKnownStatuses(string status, bool valid) =>
        Assert.Equal(valid, Update.Validate(ValidUpdate() with { Status = status }).IsValid);

    [Fact]
    public void AddContribution_Bounds()
    {
        var ok = new AddGoalContributionCommand(Guid.NewGuid(), 50_000_000m, Today, null, null);
        Assert.True(Add.Validate(ok).IsValid);
        Assert.True(Add.Validate(ok with { Amount = -1m }).IsValid);
        Assert.False(Add.Validate(ok with { Amount = 0m }).IsValid);
        Assert.False(Add.Validate(ok with { Amount = -1_000_000_000_000_000_000m }).IsValid);
        Assert.False(Add.Validate(ok with { ContributedOn = Today.AddDays(1) }).IsValid);
        Assert.True(Add.Validate(ok with { Note = new string('n', 280) }).IsValid);
        Assert.False(Add.Validate(ok with { Note = new string('n', 281) }).IsValid);
    }

    [Fact]
    public void ReplaceCostItems_Bounds()
    {
        var line = new GoalCostItemInput("purchase_price", "Price", 500_000_000m);
        Assert.True(Costs.Validate(new ReplaceGoalCostItemsCommand(Guid.NewGuid(), [line])).IsValid);
        Assert.True(Costs.Validate(new ReplaceGoalCostItemsCommand(Guid.NewGuid(), [])).IsValid);
        Assert.False(Costs.Validate(new ReplaceGoalCostItemsCommand(Guid.NewGuid(), Enumerable.Repeat(line, 21).ToList())).IsValid);
        Assert.False(Costs.Validate(new ReplaceGoalCostItemsCommand(Guid.NewGuid(), [line with { ItemType = "rate" }])).IsValid);
        Assert.False(Costs.Validate(new ReplaceGoalCostItemsCommand(Guid.NewGuid(), [line with { Label = " " }])).IsValid);
        Assert.False(Costs.Validate(new ReplaceGoalCostItemsCommand(Guid.NewGuid(), [line with { Label = new string('l', 81) }])).IsValid);
        Assert.False(Costs.Validate(new ReplaceGoalCostItemsCommand(Guid.NewGuid(), [line with { Amount = -1m }])).IsValid);
        Assert.True(Costs.Validate(new ReplaceGoalCostItemsCommand(Guid.NewGuid(), [line with { Amount = 0m }])).IsValid);
    }

    [Fact]
    public void Preview_PastDateAllowed_BadBoundsRejected()
    {
        var ok = new PreviewGoalQuery(null, "vehicle", 1_000_000m, null, Today.AddYears(-1), null, null);
        Assert.True(Preview.Validate(ok).IsValid);
        Assert.False(Preview.Validate(ok with { TargetAmount = 0m }).IsValid);
        Assert.False(Preview.Validate(ok with { PriceGrowthRate = 2m }).IsValid);
        Assert.False(Preview.Validate(ok with { Category = "holiday" }).IsValid);
        Assert.False(Preview.Validate(ok with { CostItems = [new GoalCostItemInput("tax", "Tax", -5m)] }).IsValid);
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData("open", true)]
    [InlineData("closed", true)]
    [InlineData("paused", true)]
    [InlineData("everything", false)]
    public void GetGoals_Status_OpenClosedOrOneStatus(string? status, bool valid) =>
        Assert.Equal(valid, List.Validate(new GetGoalsQuery("big_purchase", status)).IsValid);
}
