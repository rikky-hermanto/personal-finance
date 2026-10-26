namespace PersonalFinance.Application.Quests;

public static class QuestCatalog
{
    public const int Version = 1;

    public static readonly IReadOnlyList<QuestDefinition> V1 = Build();

    public static QuestDefinition? Find(string code) => V1.FirstOrDefault(q => q.Code == code);

    private static IReadOnlyList<QuestDefinition> Build()
    {
        var quests = new List<QuestDefinition>
        {
            new("l1.meet_your_money", "L1", QuestKind.Discovery, new TransactionsExist(), [], false,
                "Meet your money", "Upload one statement and see where your money really goes.", "/cashflow/upload"),
            new("l1.sort_the_pile", "L1", QuestKind.Discovery, new TopExpensesCategorized(5), [], false,
                "Sort the mystery pile", "Give last month's biggest expenses a category so your spending picture is true.", "/cashflow/transactions"),
            // One rung per account: rung k means "k accounts covered". The count grows when an account is added.
            new("l1.full_picture", "L1", QuestKind.Discovery, new AccountsCovered(), [], false,
                "Full picture", "Upload a statement from every account you spend from.", "/cashflow/upload"),
            // Source: scoring-rubric.md spend_lt_income, ratio 1.00 is the 0-point breakpoint.
            new("l1.in_the_green", "L1", QuestKind.Ladder, new GreenMonth(), [], false,
                "In the green", "Spend less than you earn in a single month.", "/cashflow/overview"),
            // Recognition, so the board never offers or lists it before it happens. The only hidden quest here.
            new("l1.honest_harvest", "L1", QuestKind.Recognition, new RedMonthRecorded(), [], false,
                "Honest Harvest", "You harvested a month that ran over. Honest data keeps every score true.", null),
            new("l1.boss", "L1", QuestKind.Boss, new LevelGraduated("L1"), [], false,
                "Foundations cleared", "Every Foundations indicator has reached the clearing bar.", null),

            new("l2.count_your_cushion", "L2", QuestKind.Discovery, new ValuationExists("savings"), [], false,
                "Count your cushion", "Record what is in your savings so we can tell you how many months it covers.", "/assets/accounts"),
            new("l2.map_your_debts", "L2", QuestKind.Discovery, new DebtsMapped(), [], false,
                "Map your debts", "Add each loan or paylater you have, or confirm you have none.", "/assets/liabilities"),
            // Source: scoring-rubric.md liquid_savings_ratio, 0.5 months is the 0-point and 3 months the
            // 100-point breakpoint. Half-month posts are celebration points only; they never change a score.
            // G6 (stale balances) is applied once, in QuestContextFactory, by marking the cover indicator untrusted.
            new("l2.fence_posts", "L2", QuestKind.Ladder,
                new RawValueAtLeast("liquid_savings_ratio", StepNoun: "posts", ValueUnit: "months"),
                [0.5m, 1m, 1.5m, 2m, 2.5m, 3m], true,
                "Build the fence", "Each post is half a month of expenses in savings, up to three months.", "/assets/accounts"),
            new("l2.boss", "L2", QuestKind.Boss, new LevelGraduated("L2"), [], false,
                "The fence holds", "Every Defense indicator has reached the clearing bar.", null),
        };

        // Stars: recognition only. Rung k (1..3) = score 50 / 70 / 100. Never offered, they just happen.
        foreach (var star in StarRungs.Indicators)
            quests.Add(new($"stars.{star.Code}", star.Level, QuestKind.Recognition,
                new IndicatorScoreAtLeast(star.Code), StarRungs.Scores, false, star.Code, string.Empty, null));

        return quests;
    }
}
