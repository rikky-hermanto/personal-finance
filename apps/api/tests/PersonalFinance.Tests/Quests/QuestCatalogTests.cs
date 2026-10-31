using System.Text.RegularExpressions;
using PersonalFinance.Application.Quests;
using Xunit;

namespace PersonalFinance.Tests.Quests;

public class QuestCatalogTests
{
    // G8: quest copy may not name products, issuers, asset classes, allocations or returns (FIN-05).
    private static readonly Regex BannedWords = new(
        @"stock|saham|equity|bond|obligasi|sbn|\bori\b|sukuk|reksa|mutual fund|\betf\b|crypto|bitcoin|gold|emas|p2p|deposit|deposito|property|properti|bibit|ajaib|stockbit|bareksa|gopay|ovo|kredivo|akulaku|return|yield|imbal|profit|cuan|trading|\btrade\b|allocat|alokasi|diversif",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex BannedPercent = new(@"\d+(\.\d+)?\s*%(?! of income)", RegexOptions.Compiled);

    private static bool Violates(string text) => BannedWords.IsMatch(text) || BannedPercent.IsMatch(text);

    private static IEnumerable<string> AllCopy()
    {
        foreach (var q in QuestCatalog.V1)
        {
            yield return q.Title;
            yield return q.Why;
        }
        foreach (var star in StarRungs.Indicators)
            for (var rung = 1; rung <= StarRungs.Scores.Count; rung++)
                yield return StarRungs.RungCopy(star.Code, rung);
    }

    [Fact]
    public void Catalog_Codes_AreUnique()
    {
        // Arrange / Act
        var duplicates = QuestCatalog.V1.GroupBy(q => q.Code).Where(g => g.Count() > 1).Select(g => g.Key).ToList();

        // Assert
        Assert.Empty(duplicates);
    }

    [Fact]
    public void Catalog_Rungs_AscendStrictly()
    {
        foreach (var q in QuestCatalog.V1)
            for (var i = 1; i < q.Rungs.Count; i++)
                Assert.True(q.Rungs[i] > q.Rungs[i - 1], $"{q.Code} rung {i} does not ascend");
    }

    [Fact]
    public void Catalog_StarsExistOnlyForTheFourLiveIndicators()
    {
        // Arrange
        var expected = new[] { "spend_lt_income", "liquid_savings_ratio", "manageable_dti", "savings_rate" };

        // Act: Recognition quests are the four stars plus the hidden Honest Harvest.
        var stars = QuestCatalog.V1.Where(q => q.Kind == QuestKind.Recognition && q.Code.StartsWith("stars."))
            .Select(q => q.Code.Replace("stars.", string.Empty)).ToList();

        // Assert
        Assert.Equal(expected.OrderBy(x => x), stars.OrderBy(x => x));
    }

    [Fact]
    public void Catalog_EveryNonStarQuest_HasRevealCopy()
    {
        // A new quest cannot ship without a Harvest reveal line (G8 covers Honest Harvest too).
        var missing = QuestCatalog.V1
            .Where(q => !q.Code.StartsWith("stars."))
            .Select(q => q.Code)
            .Where(code => !PersonalFinance.Application.Services.Harvest.HarvestCopy.RegisteredCodes.Contains(code))
            .ToList();

        Assert.Empty(missing);
    }

    [Fact]
    public void Catalog_G8Lint_CoversHonestHarvest()
    {
        var quest = QuestCatalog.Find("l1.honest_harvest");
        Assert.NotNull(quest);
        Assert.Equal(QuestKind.Recognition, quest.Kind);
        Assert.False(Violates(quest.Title));
        Assert.False(Violates(quest.Why));
    }

    [Fact]
    public void Catalog_OnlyLadderQuestsMoveMoney() =>
        Assert.All(QuestCatalog.V1.Where(q => q.MovesMoney), q => Assert.Equal(QuestKind.Ladder, q.Kind));

    [Fact]
    public void Catalog_MovesMoney_OnlyFencePosts() =>
        Assert.Equal(["l2.fence_posts"], QuestCatalog.V1.Where(q => q.MovesMoney).Select(q => q.Code).ToList());

    [Fact]
    public void Catalog_AllCopy_PassesTheG8Lint()
    {
        foreach (var text in AllCopy())
            Assert.False(Violates(text), $"G8 lint: \"{text}\"");
    }

    [Theory]
    [InlineData("Put 60% in stocks")]
    [InlineData("Buy gold")]
    [InlineData("Earn 8% return")]
    public void Lint_CatchesABadSample(string sample) => Assert.True(Violates(sample));

    [Fact]
    public void Lint_AllowsPercentOfIncome() => Assert.False(Violates("Spending under 89% of income"));

    [Fact]
    public void QuestDefinition_HasNoPointsLikeMember()
    {
        // G2: celebrate with stars and posts, never a point value.
        var bad = new Regex("point|gain|xp|reward", RegexOptions.IgnoreCase);
        var names = typeof(QuestDefinition).GetProperties().Select(p => p.Name);
        Assert.DoesNotContain(names, bad.IsMatch);
    }
}
