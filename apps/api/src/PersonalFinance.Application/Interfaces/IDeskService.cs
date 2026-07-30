using PersonalFinance.Application.Dtos.Desk;

namespace PersonalFinance.Application.Interfaces;

public interface IDeskService
{
    Task<DeskStateDto> GetStateAsync();
    Task<DeskPositionDto> SetPositionSleeveAsync(Guid positionId, string sleeve);
    Task<DeskReconIssueDto> ResolveReconIssueAsync(Guid issueId, string resolution);
}
