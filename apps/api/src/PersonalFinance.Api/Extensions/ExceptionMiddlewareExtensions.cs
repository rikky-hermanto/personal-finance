using PersonalFinance.Api.Models;
using System.Net;
using System.Text.Json;

namespace PersonalFinance.Api.Extensions
{
    public static class ExceptionMiddlewareExtensions
    {
        public static IApplicationBuilder UseApiExceptionHandler(this IApplicationBuilder app)
        {
            return app.Use(async (context, next) =>
            {
                try
                {
                    await next();
                }
                catch (Exception ex)
                {
                    context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
                    context.Response.ContentType = "application/json";
                    
                    // Get the innermost exception
                    var innermostException = GetInnermostException(ex);
                    
                    var error = new ApiError
                    {
                        Message = "An unexpected error occurred.",
//#if DEBUG
                        Detail = innermostException.Message
//#endif
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