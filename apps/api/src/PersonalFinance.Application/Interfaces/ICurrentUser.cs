namespace PersonalFinance.Application.Interfaces;

/// <summary>The identity verified for the current HTTP request.</summary>
public interface ICurrentUser
{
    Guid UserId { get; }
    string AccessToken { get; }
}
