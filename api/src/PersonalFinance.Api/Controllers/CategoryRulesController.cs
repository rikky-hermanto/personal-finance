using Microsoft.AspNetCore.Mvc;
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
}