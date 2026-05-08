using System.IO;
using System.Linq;
using System.Threading.Tasks;
using PersonalFinance.Application.Interfaces;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace PersonalFinance.Tests.Parsers;

public class BcaCsvParserTests
{
    private readonly BcaCsvParser _parser;
    private readonly Mock<ICategoryRuleService> _categoryRuleServiceMock;

    public BcaCsvParserTests()
    {
        _categoryRuleServiceMock = new Mock<ICategoryRuleService>();
        var loggerMock = new Mock<ILogger<BcaCsvParser>>();
        _parser = new BcaCsvParser(_categoryRuleServiceMock.Object, loggerMock.Object);
    }

    [Theory]
    [InlineData("sample_bca_working.csv")]
    [InlineData("sample_bca_notworking.csv")]
    public async Task ParseAsync_BothFormats_ProduceIdenticalTransactionSet(string fixture)
    {
        var path = Path.Combine("Fixtures", "Bca", fixture);
        using var stream = File.OpenRead(path);
        
        var transactions = await _parser.ParseAsync(stream);
        
        Assert.Equal(5, transactions.Count);
        
        var first = transactions.First();
        Assert.Equal(2, first.Date.Month); // Feb 1
        Assert.Equal(500000m, first.AmountIdr);
        Assert.Equal("CR", first.Flow);
        Assert.Equal(1500000.00m, first.Balance);
        
        var last = transactions.Last();
        Assert.Equal(2150000.00m, last.Balance);
        
        var sumCr = transactions.Where(t => t.Flow == "CR").Sum(t => t.AmountIdr);
        var sumDb = transactions.Where(t => t.Flow == "DB").Sum(t => t.AmountIdr);
        
        Assert.Equal(1500000m, sumCr);
        Assert.Equal(350000m, sumDb);
    }
}
