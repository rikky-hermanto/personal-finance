using PersonalFinance.Api.Models;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;

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
                    logger.LogError(ex, "An unhandled exception has occurred while executing the request.");

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