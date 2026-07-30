using System.Text.Json;
using FluentValidation;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos.Desk;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities.Desk;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Services.Desk;

public class DeskMandateService(Supabase.Client supabase, ILogger<DeskMandateService> logger) : IDeskMandateService
{
    private static readonly Guid PlaceholderUserId = Guid.Empty;

    public async Task<List<DeskMandateVersionDto>> GetVersionsAsync()
    {
        var result = await supabase.From<DeskMandateVersion>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Order("version", Ordering.Descending)
            .Get();

        return result.Models.Select(DeskMappers.ToDto).ToList();
    }

    public async Task<DeskMandateVersionDto> SaveDraftAsync(MandateParamsDto parameters, string? preset, DateOnly? effectiveDate, string? changeReason)
    {
        var existing = await supabase.From<DeskMandateVersion>()
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Order("version", Ordering.Descending)
            .Get();

        var nextVersion = (existing.Models.Select(m => m.Version).DefaultIfEmpty(0).Max()) + 1;

        logger.LogInformation("Saving mandate draft v{Version} for user {UserId}", nextVersion, PlaceholderUserId);

        var entity = new DeskMandateVersion
        {
            Id = Guid.NewGuid(),
            UserId = PlaceholderUserId,
            Version = nextVersion,
            Status = "draft",
            Preset = preset,
            Params = JsonSerializer.Serialize(parameters),
            EffectiveDate = effectiveDate?.ToDateTime(TimeOnly.MinValue),
            ChangeReason = changeReason,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        var result = await supabase.From<DeskMandateVersion>().Insert(entity);
        return DeskMappers.ToDto(result.Models.First());
    }

    public async Task<DeskMandateVersionDto> ApproveAsync(Guid versionId, string changeReason, bool reviewed)
    {
        // Re-asserted here (not just in the FluentValidation validator) so a direct API call
        // without the "I have reviewed" checkbox can never approve a mandate.
        if (string.IsNullOrWhiteSpace(changeReason))
            throw new ValidationException("A change reason is required to approve a mandate version.");
        if (!reviewed)
            throw new ValidationException("The reviewer confirmation must be checked to approve a mandate version.");

        var result = await supabase.From<DeskMandateVersion>()
            .Filter("id", Operator.Equals, versionId.ToString())
            .Filter("user_id", Operator.Equals, PlaceholderUserId.ToString())
            .Get();
        var existing = result.Models.FirstOrDefault()
            ?? throw new KeyNotFoundException($"Mandate version {versionId} not found.");

        if (existing.Status == "approved")
            throw new ValidationException("This mandate version is already approved and cannot be re-approved.");

        logger.LogInformation("Approving mandate version {Version} for user {UserId}", existing.Version, PlaceholderUserId);

        existing.Status = "approved";
        existing.ChangeReason = changeReason;
        existing.ApprovedAt = DateTime.UtcNow;
        existing.UpdatedAt = DateTime.UtcNow;

        var updated = await supabase.From<DeskMandateVersion>().Update(existing);
        return DeskMappers.ToDto(updated.Models.First());
    }
}
