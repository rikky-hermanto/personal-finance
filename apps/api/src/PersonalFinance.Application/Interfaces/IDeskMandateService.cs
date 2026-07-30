using PersonalFinance.Application.Dtos.Desk;

namespace PersonalFinance.Application.Interfaces;

public interface IDeskMandateService
{
    Task<List<DeskMandateVersionDto>> GetVersionsAsync();
    Task<DeskMandateVersionDto> SaveDraftAsync(MandateParamsDto parameters, string? preset, DateOnly? effectiveDate, string? changeReason);
    Task<DeskMandateVersionDto> ApproveAsync(Guid versionId, string changeReason, bool reviewed);
}
