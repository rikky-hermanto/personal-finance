using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Domain.Entities;

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
        => Ok(await _categoryRuleService.GetAllAsync());

    [HttpPost]
    public async Task<IActionResult> Add(CategoryRule rule)
    {
        var created = await _categoryRuleService.AddAsync(rule);
        return Ok(created);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, CategoryRule rule)
    {
        var updated = await _categoryRuleService.UpdateAsync(id, rule);
        if (updated == null) return NotFound();
        return Ok(updated);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var deleted = await _categoryRuleService.DeleteAsync(id);
        if (!deleted) return NotFound();
        return Ok();
    }
}