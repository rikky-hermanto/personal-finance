namespace PersonalFinance.Api.Models;

public class UploadOptions
{
    public const string SectionName = "Upload";

    /// <summary>
    /// SEC-02: time budget for bank identification plus statement parsing, so a crafted
    /// PDF cannot hold a request indefinitely.
    /// </summary>
    public int ParseTimeoutSeconds { get; set; } = 60;
}
