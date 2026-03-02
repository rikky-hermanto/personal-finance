using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TransactionsController : ControllerBase
{
    private readonly IStatementImportService _statementImportService;
    private readonly IBankIdentifier _bankIdentifier;
    private readonly ITransactionService _transactionService;
    private readonly ICategoryRuleService _categoryRuleService;

    public TransactionsController(
        IStatementImportService statementImportService,
        IBankIdentifier bankIdentifier,
        ITransactionService transactionService,
        ICategoryRuleService categoryRuleService)
    {
        _statementImportService = statementImportService;
        _bankIdentifier = bankIdentifier;
        _transactionService = transactionService;
        _categoryRuleService = categoryRuleService;
    }

    [HttpGet("health")]
    public IActionResult HealthCheck()
    {
        return Ok(new { status = "Healthy" });
    }

    [HttpGet("supported-types")]
    public IActionResult GetSupportedTypes()
    {
        var supported = new[]
        {
            new { Bank = "BCA", Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "NeoBank", Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "Superbank", Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "Wise", Types = new[] { "text/csv", "application/pdf" } },
            new { Bank = "Standard", Types = new[] { "text/csv" } }
        };
        return Ok(supported);
    }

    [HttpPost("upload-preview")]
    public async Task<IActionResult> UploadPreview(IFormFile file, [FromForm] string? pdfPassword = null)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File is empty");

        var allowedContentTypes = new[] { "text/csv", "application/pdf" };
        if (!allowedContentTypes.Contains(file.ContentType))
            return BadRequest("Unsupported file type");

        using var mainStream = new MemoryStream();
        await file.CopyToAsync(mainStream);
        using var preStream = file.OpenReadStream();

        var bank = await _bankIdentifier.IdentifyAsync(preStream, file.ContentType, pdfPassword);
        if (bank == null)
            return BadRequest("Bank format not recognized or not supported.");

        mainStream.Position = 0;

        try
        {
            var transactions = await _statementImportService.ImportAsync(mainStream, bank, pdfPassword);

            // Filter out duplicates before preview
            var nonDuplicateTransactions = await _transactionService.FilterOutDuplicatesAsync(transactions);

            // Map to DTOs for preview (no persistence)
            var previewDtos = nonDuplicateTransactions.Select(t => new TransactionDto
            {
                Date = t.Date,
                Description = t.Description,
                Remarks = t.Remarks,
                Flow = t.Flow,
                Type = t.Type,
                Category = t.Category,
                Wallet = t.Wallet,
                AmountIdr = t.AmountIdr,
                Currency = t.Currency,
                ExchangeRate = t.ExchangeRate,
                Balance = 0 // Not calculated for preview
            }).ToList();

            return Ok(previewDtos);
        }
        catch (NotSupportedException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Failed to parse file: {ex.Message}");
        }
    }

    [HttpPost("submit")]
    public async Task<IActionResult> SubmitTransactions([FromBody] List<TransactionDto> transactions)
    {
        if (transactions == null || transactions.Count == 0)
            return BadRequest("No transactions to submit.");

        // Implicitly add new categories if not existed
        foreach (var dto in transactions)
        {
            if (!string.IsNullOrWhiteSpace(dto.Category))
            {
                var existing = (await _categoryRuleService.GetAllAsync())
                    .Any(r => r.Category == dto.Category && r.Type == dto.Type);

                if (!existing && dto.CategoryRuleDto is not null)
                {
                    // Use the provided CategoryRuleDto for new rule creation
                    await _categoryRuleService.AddAsync(dto.CategoryRuleDto);
                }
            }
        }

        // Map domain transactions to DTOs before calling AddTransactionsAsync
        var domainTransactions = transactions.Select(t => new TransactionDto
        {
            Date = t.Date,
            Description = t.Description,
            Remarks = t.Remarks,
            Flow = t.Flow,
            Type = t.Type,
            Category = t.Category,
            Wallet = t.Wallet,
            AmountIdr = t.AmountIdr,
            Currency = t.Currency,
            ExchangeRate = t.ExchangeRate
        }).ToList();

        var addedTransactions = await _transactionService.AddTransactionsAsync(domainTransactions);

        return Ok(new
        {
            Message = $"{addedTransactions.Count} transactions imported successfully.",
            Transactions = addedTransactions
        });
    }

    // List all transactions, with optional filtering by wallet, category, or type
    [HttpGet]
    public async Task<IActionResult> GetTransactions([FromQuery] string? wallet = null, [FromQuery] string? category = null, [FromQuery] string? type = null)
    {
        // You may want to add a new service method for more advanced filtering/paging.
        // For now, use GetTransactionsWithBalanceAsync if wallet is specified, otherwise return all.
        
        var transactions = await _transactionService.GetTransactionsWithBalanceAsync(wallet);
        // Optionally filter by category/type
        if (!string.IsNullOrEmpty(category))
            transactions = transactions.Where(t => t.Category == category).ToList();
        if (!string.IsNullOrEmpty(type))
            transactions = transactions.Where(t => t.Type == type).ToList();
        return Ok(transactions);
       
    }

    // Get details for a specific transaction by ID
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetTransactionById(int id)
    {
        // You need to add this method to your ITransactionService and implementation.
        var transaction = await _transactionService.GetTransactionByIdAsync(id);
        if (transaction == null)
            return NotFound();
        return Ok(transaction);
    }

    // Dashboard endpoint - get aggregated data for dashboard
    [HttpGet("aggregated")]
    public async Task<IActionResult> GetDashboardData([FromQuery] string? wallet = null, [FromQuery] int? year = null, [FromQuery] int? month = null)
    {
        try
        {
            var currentYear = year ?? DateTime.Now.Year;
            var currentMonth = month ?? DateTime.Now.Month;
            
            // Get all transactions with optional wallet filter
            var allTransactions = await _transactionService.GetTransactionsWithBalanceAsync(wallet);
            
            // Filter by current year for main stats
            var yearTransactions = allTransactions.Where(t => t.Date.Year == currentYear).ToList();
            var monthTransactions = yearTransactions.Where(t => t.Date.Month == currentMonth).ToList();
            
            // Calculate main stats
            var totalIncome = yearTransactions.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
            var totalExpenses = yearTransactions.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);
            var netWorth = totalIncome - totalExpenses;
            var transactionCount = yearTransactions.Count;
            
            // Current month stats
            var monthIncome = monthTransactions.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
            var monthExpenses = monthTransactions.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);
            var monthNet = monthIncome - monthExpenses;
            
            // Previous month for comparison
            var prevMonth = currentMonth == 1 ? 12 : currentMonth - 1;
            var prevYear = currentMonth == 1 ? currentYear - 1 : currentYear;
            var prevMonthTransactions = allTransactions.Where(t => t.Date.Year == prevYear && t.Date.Month == prevMonth).ToList();
            var prevMonthIncome = prevMonthTransactions.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
            var prevMonthExpenses = prevMonthTransactions.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);
            var prevMonthNet = prevMonthIncome - prevMonthExpenses;
            
            // Calculate percentage changes
            var incomeChange = prevMonthIncome != 0 ? ((monthIncome - prevMonthIncome) / prevMonthIncome) * 100 : 0;
            var expenseChange = prevMonthExpenses != 0 ? ((monthExpenses - prevMonthExpenses) / prevMonthExpenses) * 100 : 0;
            var netChange = prevMonthNet != 0 ? ((monthNet - prevMonthNet) / Math.Abs(prevMonthNet)) * 100 : 0;
            
            // Top categories for current month expenses
            var topCategories = monthTransactions
                .Where(t => t.Type == "Expense" && !string.IsNullOrEmpty(t.Category))
                .GroupBy(t => t.Category)
                .Select(g => new
                {
                    Category = g.Key,
                    Amount = g.Sum(t => t.AmountIdr),
                    Percentage = totalExpenses != 0 ? Math.Round((g.Sum(t => t.AmountIdr) / totalExpenses) * 100, 1) : 0
                })
                .OrderByDescending(x => x.Amount)
                .Take(5)
                .ToList();
            
            // Cash flow data for last 6 months
            var cashFlowData = new List<object>();
            for (int i = 5; i >= 0; i--)
            {
                var targetDate = DateTime.Now.AddMonths(-i);
                var monthlyTransactions = allTransactions.Where(t => t.Date.Year == targetDate.Year && t.Date.Month == targetDate.Month).ToList();
                var monthlyIncome = monthlyTransactions.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
                var monthlyExpenses = monthlyTransactions.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);
                var monthlyNet = monthlyIncome - monthlyExpenses;
                
                cashFlowData.Add(new
                {
                    Month = targetDate.ToString("MMM yy"),
                    Income = monthlyIncome,
                    Expenses = monthlyExpenses,
                    Net = monthlyNet
                });
            }
            
            var dashboardData = new
            {
                Summary = new
                {
                    TotalIncome = totalIncome,
                    TotalExpenses = totalExpenses,
                    NetWorth = netWorth,
                    TransactionCount = transactionCount
                },
                CurrentMonth = new
                {
                    Month = DateTime.Now.ToString("MMMM yyyy"),
                    Income = monthIncome,
                    Expenses = monthExpenses,
                    Net = monthNet,
                    IncomeChangePercent = Math.Round(incomeChange, 1),
                    ExpenseChangePercent = Math.Round(expenseChange, 1),
                    NetChangePercent = Math.Round(netChange, 1)
                },
                TopCategories = topCategories,
                CashFlow = cashFlowData,
                LastUpdated = DateTime.Now
            };
            
            return Ok(dashboardData);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Failed to retrieve dashboard data: {ex.Message}");
        }
    }
}
