namespace PersonalFinance.Api.Models;

public class ApiError
{
    public required string Message { get; set; }
    public string? Detail { get; set; }
}