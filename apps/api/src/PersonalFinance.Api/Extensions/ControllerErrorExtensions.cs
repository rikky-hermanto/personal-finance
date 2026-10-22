using Microsoft.AspNetCore.Mvc;

namespace PersonalFinance.Api.Extensions;

public static class ControllerErrorExtensions
{
    /// <summary>
    /// ERR-01 / ERR-04: log the full exception, then return only a fixed message and the
    /// request's correlation ID, so the client can quote it and the log line can be found.
    /// </summary>
    public static ObjectResult LoggedError(
        this ControllerBase controller, ILogger logger, Exception exception, int statusCode, string message)
    {
        var correlationId = controller.HttpContext.TraceIdentifier;
        logger.LogError(exception, "Request failed with {StatusCode} (correlation {CorrelationId})",
            statusCode, correlationId);
        return controller.StatusCode(statusCode, new { Message = message, CorrelationId = correlationId });
    }
}
