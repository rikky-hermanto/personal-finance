using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using System.Globalization;
using CsvHelper;
using CsvHelper.Configuration;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CategoryRulesController : ControllerBase
{
    private readonly ICategoryRuleService _categoryRuleService;

    public CategoryRulesController(ICategoryRuleService categoryRuleService)
    {
        _categoryRuleService = categoryRuleService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var rules = await _categoryRuleService.GetAllAsync();
        var dtos = rules.Select(r => new CategoryRuleDto
        {
            Id = r.Id,
            Keyword = r.Keyword,
            Type = r.Type,
            Category = r.Category,
            KeywordLength = r.KeywordLength
        }).ToList();
        return Ok(dtos);
    }

    [HttpPost]
    public async Task<IActionResult> Add(CategoryRuleDto ruleDto)
    {
        var created = await _categoryRuleService.AddAsync(ruleDto);
        var createdDto = new CategoryRuleDto
        {
            Id = created.Id,
            Keyword = created.Keyword,
            Type = created.Type,
            Category = created.Category,
            KeywordLength = created.KeywordLength
        };
        return Ok(createdDto);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, CategoryRuleDto ruleDto)
    {
        var updated = await _categoryRuleService.UpdateAsync(id, ruleDto);
        if (updated == null) return NotFound();
        var updatedDto = new CategoryRuleDto
        {
            Id = updated.Id,
            Keyword = updated.Keyword,
            Type = updated.Type,
            Category = updated.Category,
            KeywordLength = updated.KeywordLength
        };
        return Ok(updatedDto);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var deleted = await _categoryRuleService.DeleteAsync(id);
        if (!deleted) return NotFound();
        return Ok();
    }

    [HttpDelete("reset")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    public async Task<IActionResult> ResetAllRules()
    {
        await _categoryRuleService.DeleteAllAsync();
        return Ok(new { message = "All rules deleted successfully" });
    }

    [HttpGet("export")]
    public async Task<IActionResult> ExportCsv()
    {
        var rules = await _categoryRuleService.GetAllAsync();

        var stream = new MemoryStream();
        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            Delimiter = "," // Default to comma for export
        };

        using (var writer = new StreamWriter(stream, leaveOpen: true))
        using (var csv = new CsvWriter(writer, config))
        {
            foreach (var header in new[] { "Keyword", "Type", "Category" })
                csv.WriteField(header);
            await csv.NextRecordAsync();

            foreach (var r in rules)
            {
                csv.WriteField(r.Keyword);
                csv.WriteField(r.Type);
                csv.WriteField(r.Category);
                await csv.NextRecordAsync();
            }
        }

        stream.Position = 0;
        return File(stream, "text/csv", $"category-rules-{DateTime.UtcNow:yyyy-MM-dd}.csv");
    }

    [HttpPost("import")]
    public async Task<IActionResult> ImportCsv(IFormFile file)
    {
        if (file == null || file.Length == 0) return BadRequest("File is empty.");

        var added = 0;
        using var stream = file.OpenReadStream();
        using var reader = new StreamReader(stream);

        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            DetectDelimiter = true,
            DetectDelimiterValues = [",", ";", "\t"],
            HeaderValidated = null,
            MissingFieldFound = null
        };

        using var csv = new CsvReader(reader, config);

        csv.Read();
        csv.ReadHeader();

        while (csv.Read())
        {
            var keyword = csv.GetField<string>("Keyword");
            var type = csv.GetField<string>("Type");
            var category = csv.GetField<string>("Category");

            if (!string.IsNullOrWhiteSpace(keyword) && !string.IsNullOrWhiteSpace(type) && !string.IsNullOrWhiteSpace(category))
            {
                await _categoryRuleService.AddAsync(new CategoryRuleDto { Keyword = keyword, Type = type, Category = category });
                added++;
            }
        }
        return Ok(new { added });
    }
}