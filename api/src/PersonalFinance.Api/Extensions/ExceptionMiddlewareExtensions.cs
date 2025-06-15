using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
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
                    var error = new ApiError
                    {
                        Message = "An unexpected error occurred.",
#if DEBUG
                        Detail = ex.Message
#endif
                    };
                    var json = JsonSerializer.Serialize(error);
                    await context.Response.WriteAsync(json);
                }
            });
        }
    }
}