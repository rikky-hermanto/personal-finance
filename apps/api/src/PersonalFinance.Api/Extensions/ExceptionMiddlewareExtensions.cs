using PersonalFinance.Api.Models;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using System.Diagnostics;
using OpenTelemetry.Trace;
using PersonalFinance.Application.Dtos;


namespace PersonalFinance.Api.Extensions
{
    public static class ExceptionMiddlewareExtensions
    {
        public static IApplicationBuilder UseApiExceptionHandler(this IApplicationBuilder app)
        {
            var logger = app.ApplicationServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger(nameof(ExceptionMiddlewareExtensions));

            return app.Use(async (context, next) =>
            {
                try
                {
                    await next();
                }
                catch (Exception ex)
                {
                    if (ex is CashflowMutationException mutation)
                    {
                        var (status, code) = mutation.Failure switch
                        {
                            CashflowMutationFailure.InvalidInput => (400, "invalid_input"),
                            CashflowMutationFailure.AccountUnavailable => (404, "account_unavailable"),
                            CashflowMutationFailure.InstitutionUnavailable => (404, "institution_unavailable"),
                            CashflowMutationFailure.AccountInUse => (409, "account_in_use"),
                            CashflowMutationFailure.RuleExists => (409, "rule_exists"),
                            CashflowMutationFailure.IdempotencyConflict => (409, "idempotency_conflict"),
                            CashflowMutationFailure.FileAlreadyProcessed => (409, "file_already_processed"),
                            CashflowMutationFailure.ConstraintConflict => (409, "mutation_constraint_conflict"),
                            CashflowMutationFailure.Retryable => (503, "retry_mutation"),
                            _ => (500, "cashflow_unavailable")
                        };
                        logger.LogWarning("Checked Cashflow mutation failed: {Failure}", mutation.Failure);
                        context.Response.StatusCode = status;
                        context.Response.ContentType = "application/json";
                        await context.Response.WriteAsync(JsonSerializer.Serialize(new { Code = code }));
                        return;
                    }
                    if (ex is AiChatUnavailableException && !context.Response.HasStarted)
                    {
                        // The upstream body was already logged by AiChatClient; never echo it (ERR-01).
                        logger.LogWarning("AI chat call failed");
                        context.Response.StatusCode = StatusCodes.Status502BadGateway;
                        context.Response.ContentType = "application/json";
                        await context.Response.WriteAsync(JsonSerializer.Serialize(new { Code = "ai_unavailable" }));
                        return;
                    }
                    if (ex is KeyNotFoundException)
                    {
                        // ERR-03. Also the answer for another owner's id: RLS hides the row.
                        logger.LogInformation("Requested resource not found: {Path}", context.Request.Path);
                        context.Response.StatusCode = StatusCodes.Status404NotFound;
                        context.Response.ContentType = "application/json";
                        await context.Response.WriteAsync(JsonSerializer.Serialize(new ApiError { Message = "Not found." }));
                        return;
                    }
                    logger.LogError(ex, "An unhandled exception has occurred while executing the request.");

                    Activity.Current?.SetStatus(ActivityStatusCode.Error, ex.Message);
                    Activity.Current?.RecordException(ex);


                    context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
                    context.Response.ContentType = "application/json";

                    var innermostException = GetInnermostException(ex);

                    var error = new ApiError
                    {
                        Message = "An unexpected error occurred.",
#if DEBUG
                        Detail = innermostException.Message
#endif
                    };
                    var json = JsonSerializer.Serialize(error);
                    await context.Response.WriteAsync(json);
                }
            });
        }

        private static Exception GetInnermostException(Exception exception)
        {
            var current = exception;
            while (current.InnerException != null)
            {
                current = current.InnerException;
            }
            return current;
        }
    }
}
