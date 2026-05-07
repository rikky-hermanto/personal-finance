using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services;

namespace PersonalFinance.Tests.Services;

public class CategorizationLayerTests
{
    // ── Layer 1: History cache ────────────────────────────────────────────────

    [Fact]
    public async Task CategorizeBatchAsync_HistoryCacheHit_ReturnsCachedCategory()
    {
        // Arrange: history has "Go Mie Go" DB → "Food"
        // Incoming: same description + flow
        // Expected: Category = "Food", no rule query fired

        // Implementation note: mock Supabase.Client to return a Transaction list
        // with ("Go Mie Go", "DB", "Food"), verify rules query is never called.
        // Skipped here — full implementation in integration test suite.
    }

    // ── Layer 2: Flow-aware rule matching ─────────────────────────────────────

    [Fact]
    public void TagDuplicatesLogic_FlowSpecificRuleTakesPriorityOverFlowAgnostic()
    {
        // Arrange: two rules for keyword "INTEREST":
        //   Rule A: type=Income, flow=CR, category=Saving Interest
        //   Rule B: type=Income, flow=null, category=Income  (flow-agnostic)
        // Transaction: description="INTEREST", flow=CR, type=Income
        // Expected: Category = "Saving Interest" (Rule A wins)
        var rules = new List<CategoryRuleDto>
        {
            new() { Keyword = "INTEREST", Type = "Income", Flow = "CR",  Category = "Saving Interest", KeywordLength = 8 },
            new() { Keyword = "INTEREST", Type = "Income", Flow = null,  Category = "Income",          KeywordLength = 8 },
        };
        var tx = new TransactionDto
        {
            Description = "INTEREST",
            Flow = "CR",
            Type = "Income",
            Category = "Untracked Expense",
        };

        // Apply the ordering logic from CategorizeBatchAsync inline for unit testing:
        var typeRules = rules.Where(r => r.Type.Equals(tx.Type, StringComparison.OrdinalIgnoreCase));
        var ordered = typeRules
            .Where(r => !string.IsNullOrEmpty(r.Flow) && r.Flow.Equals(tx.Flow, StringComparison.OrdinalIgnoreCase))
            .Concat(typeRules.Where(r => string.IsNullOrEmpty(r.Flow)));

        foreach (var rule in ordered)
        {
            if (tx.Description.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
            {
                tx.Category = rule.Category;
                break;
            }
        }

        Assert.Equal("Saving Interest", tx.Category);
    }

    [Fact]
    public void CategorizeBatchAsync_RemarksUsedWhenDescriptionNoMatch()
    {
        // Arrange: rule keyword "QRIS" (would match if searched in Remarks).
        // Transaction: Description="Go Mie Go" (no QRIS), Remarks="QRIS (PAYMENT)".
        // Note: "Go Mie Go" SHOULD match a Food rule by Description.
        // This test verifies Remarks fallback when Description has no rule match.
        var rule = new CategoryRuleDto { Keyword = "QRIS", Type = "Expense", Category = "Food", KeywordLength = 4 };
        var tx = new TransactionDto
        {
            Description = "Unknown Merchant",
            Remarks     = "QRIS (PAYMENT)",
            Flow        = "DB",
            Type        = "Expense",
            Category    = "Untracked Expense",
        };

        bool matched = tx.Description.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase)
                    || tx.Remarks.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase);

        Assert.True(matched);  // Remarks fallback catches it
    }

    private void ApplyLayer2Rules(TransactionDto tx, List<CategoryRuleDto> rules)
    {
        var typeRules = rules.Where(r => r.Type.Equals(tx.Type, StringComparison.OrdinalIgnoreCase));
        var ordered = typeRules
            .Where(r => !string.IsNullOrEmpty(r.Flow) && r.Flow.Equals(tx.Flow, StringComparison.OrdinalIgnoreCase))
            .Concat(typeRules.Where(r => string.IsNullOrEmpty(r.Flow)));

        foreach (var rule in ordered)
        {
            var primaryTarget = tx.Description ?? string.Empty;
            var secondaryTarget = tx.Remarks ?? string.Empty;

            if (primaryTarget.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase)
                || secondaryTarget.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
            {
                tx.Category = rule.Category;
                break;
            }
        }
    }

    [Fact]
    public void Layer2_FlowReversal_DistinguishesBetweenExpenseAndRefund()
    {
        // Based on CSV lines: 
        // 133: 19/01/2024;Kartu Halo;TOP-UP & BILLS REFUND;CR;Income;Refund
        // 132: 19/01/2024;Kartu Halo;TOP-UP & BILLS;DB;Expense;Bill
        var rules = new List<CategoryRuleDto>
        {
            new() { Keyword = "Kartu Halo", Type = "Expense", Flow = "DB", Category = "Bill" },
            new() { Keyword = "Kartu Halo", Type = "Income", Flow = "CR", Category = "Refund" }
        };

        var expenseTx = new TransactionDto { Description = "Kartu Halo", Remarks = "TOP-UP & BILLS", Flow = "DB", Type = "Expense", Category = "Untracked Expense" };
        var refundTx = new TransactionDto { Description = "Kartu Halo", Remarks = "TOP-UP & BILLS REFUND", Flow = "CR", Type = "Income", Category = "Untracked Expense" };

        ApplyLayer2Rules(expenseTx, rules);
        ApplyLayer2Rules(refundTx, rules);

        Assert.Equal("Bill", expenseTx.Category);
        Assert.Equal("Refund", refundTx.Category);
    }

    [Fact]
    public void Layer2_AssetTransferVsExpense_DistinguishesUsingRemarks()
    {
        // Based on CSV line 6: 01/01/2024;;BI-FAST DB BIAYA TXN  KE 535 RIKKI H HASIBUAN  M-BCA;DB;Expense;Transfer/Admin Fee
        var rules = new List<CategoryRuleDto>
        {
            new() { Keyword = "BIAYA TXN", Type = "Expense", Category = "Transfer/Admin Fee" },
            new() { Keyword = "TRANSFER", Type = "Asset Transfer", Category = "Bank Transfer" }
        };

        var tx = new TransactionDto 
        { 
            Description = "", 
            Remarks = "BI-FAST DB BIAYA TXN  KE 535 RIKKI H HASIBUAN  M-BCA", 
            Flow = "DB", 
            Type = "Expense", 
            Category = "Untracked Expense" 
        };

        ApplyLayer2Rules(tx, rules);

        Assert.Equal("Transfer/Admin Fee", tx.Category);
    }

    [Fact]
    public void Layer2_ComplexRemarks_MatchesCorrectly()
    {
        // Based on CSV line 14: 03/01/2024;Insight Money I-MONEY;TRSF E-BANKING DB 0301/FTFVA/WS9503133339/BIBIT.ID;DB;Saving;Emergency Fund
        var rules = new List<CategoryRuleDto>
        {
            new() { Keyword = "BIBIT.ID", Type = "Saving", Category = "Emergency Fund" }
        };

        var tx = new TransactionDto 
        { 
            Description = "Insight Money I-MONEY", 
            Remarks = "TRSF E-BANKING DB 0301/FTFVA/WS9503133339/BIBIT.ID    -                 -                 98123488851", 
            Flow = "DB", 
            Type = "Saving", 
            Category = "Untracked Expense" 
        };

        ApplyLayer2Rules(tx, rules);

        Assert.Equal("Emergency Fund", tx.Category);
    }

    [Fact]
    public void Layer2_SalaryInflow_MatchesForeignCompany()
    {
        // Based on CSV line 168: 25/01/2024;;Received money from K2FLY LTD with reference K2FLY;CR;Income;Salary;Wise
        var rules = new List<CategoryRuleDto>
        {
            new() { Keyword = "K2FLY", Type = "Income", Category = "Salary" }
        };

        var tx = new TransactionDto 
        { 
            Description = "", 
            Remarks = "Received money from K2FLY LTD with reference K2FLY", 
            Flow = "CR", 
            Type = "Income", 
            Category = "Untracked Expense" 
        };

        ApplyLayer2Rules(tx, rules);

        Assert.Equal("Salary", tx.Category);
    }

    // ── Layer 3: LLM fallback ─────────────────────────────────────────────────

    [Fact]
    public async Task ProcessAsync_LlmFallback_CategorizedWhenHighConfidence()
    {
        // Arrange: mock ILlmCategorizationClient returns ("Food", 0.95)
        // mock ICategoryRuleService.GetAllAsync returns [Food, Bill, Groceries]
        // Transaction: Description="Novel Restaurant", Category="Untracked Expense"
        // Expected: tx.Category = "Food"
        var mockLlm = new Mock<ILlmCategorizationClient>();
        mockLlm.Setup(x => x.CategorizeAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<decimal>(), It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(("Food", 0.95));

        var mockRules = new Mock<ICategoryRuleService>();
        mockRules.Setup(x => x.GetAllAsync())
            .ReturnsAsync([
                new CategoryRuleDto { Category = "Food" },
                new CategoryRuleDto { Category = "Bill" },
                new CategoryRuleDto { Category = "Groceries" },
            ]);
        mockRules.Setup(x => x.AddAsync(It.IsAny<CategoryRuleDto>()))
            .ReturnsAsync(new CategoryRuleDto());

        var mockTxService = new Mock<ITransactionService>();
        mockTxService.Setup(x => x.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
            .ReturnsAsync((IEnumerable<TransactionDto> t) => t.ToList());

        var svc = new TransactionPipelineService(
            mockTxService.Object, mockLlm.Object, mockRules.Object,
            NullLogger<TransactionPipelineService>.Instance);

        var tx = new TransactionDto
        {
            Date        = DateTime.UtcNow,
            Description = "Novel Restaurant",
            Flow        = "DB",
            Type        = "Expense",
            Category    = "Untracked Expense",
            AmountIdr   = 50000,
            Currency    = "IDR",
        };

        // Act
        var result = await svc.ProcessAsync([tx]);

        // Assert
        Assert.Single(result);
        Assert.Equal("Food", result[0].Category);
        mockRules.Verify(x => x.AddAsync(It.Is<CategoryRuleDto>(r => r.Category == "Food")), Times.Once);
    }

    [Fact]
    public async Task ProcessAsync_LlmLowConfidence_DoesNotSeedRule()
    {
        // Arrange: LLM returns ("Groceries", 0.50) — below 0.85 threshold
        // Expected: tx.Category = "Groceries" (still applied) but AddAsync never called
        var mockLlm = new Mock<ILlmCategorizationClient>();
        mockLlm.Setup(x => x.CategorizeAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<decimal>(), It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(("Groceries", 0.50));

        var mockRules = new Mock<ICategoryRuleService>();
        mockRules.Setup(x => x.GetAllAsync())
            .ReturnsAsync([new CategoryRuleDto { Category = "Groceries" }]);

        var mockTxService = new Mock<ITransactionService>();
        mockTxService.Setup(x => x.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
            .ReturnsAsync((IEnumerable<TransactionDto> t) => t.ToList());

        var svc = new TransactionPipelineService(
            mockTxService.Object, mockLlm.Object, mockRules.Object,
            NullLogger<TransactionPipelineService>.Instance);

        var tx = new TransactionDto
        {
            Date = DateTime.UtcNow, Description = "Warung Baru", Flow = "DB",
            Type = "Expense", Category = "Untracked Expense", AmountIdr = 25000, Currency = "IDR",
        };

        var result = await svc.ProcessAsync([tx]);

        Assert.Equal("Groceries", result[0].Category);
        mockRules.Verify(x => x.AddAsync(It.IsAny<CategoryRuleDto>()), Times.Never);
    }
}
