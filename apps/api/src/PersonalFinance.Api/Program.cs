using PersonalFinance.Api.Extensions;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Infrastructure.Parsers;
using PersonalFinance.Infrastructure.Supabase;
using FluentValidation;
using FluentValidation.AspNetCore;

namespace PersonalFinance.Api
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddControllers();
            builder.Services.AddHealthChecks();
            // Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
            builder.Services.AddOpenApi();

            builder.Services.AddSupabase(builder.Configuration);
            builder.Services.AddScoped<CsvTransactionParser>();
            builder.Services.AddScoped<BcaCsvParser>();
            builder.Services.AddScoped<NeoBankPdfParser>();
            builder.Services.AddScoped<DefaultCsvParser>();
            builder.Services.AddScoped<IStatementImportService>(sp =>
            {
                var parsers = new Dictionary<string, IBankStatementParser>
                {
                    { "BCA", sp.GetRequiredService<BcaCsvParser>() },
                    { "NEOBANK", sp.GetRequiredService<NeoBankPdfParser>() },
                    { "STANDARD", sp.GetRequiredService<DefaultCsvParser>() }
                };
                return new StatementImportService(parsers);
            });
            builder.Services.AddScoped<ICategoryRuleService, CategoryRuleService>();
            builder.Services.AddScoped<IBankIdentifier, BankIdentifier>();
            builder.Services.AddScoped<ITransactionService, TransactionService>();
            builder.Services.AddMediatR(cfg =>
            {
                cfg.RegisterServicesFromAssemblyContaining<Program>();
                cfg.RegisterServicesFromAssemblyContaining<CreateTransactionCommandHandler>();
            });

            // Register FluentValidation
            builder.Services.AddValidatorsFromAssemblyContaining<CreateTransactionCommandValidator>();
            builder.Services.AddValidatorsFromAssemblyContaining<CreateCategoryRuleCommandValidator>();
            builder.Services.AddValidatorsFromAssembly(typeof(Program).Assembly);
            builder.Services.AddFluentValidationAutoValidation();

            // Add CORS policy for UI at http://localhost:8080/
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowLocalhost8080", policy =>
                {
                    policy.WithOrigins("http://localhost:8080")
                          .AllowAnyHeader()
                          .AllowAnyMethod();
                });
            });

            var app = builder.Build();

            // Configure the HTTP request pipeline.
            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
            }

            app.UseHttpsRedirection();

            // Enable CORS for the specified UI origin
            app.UseCors("AllowLocalhost8080");

            //Extensions Middleware
            app.UseApiExceptionHandler();  

            app.UseAuthorization();

            app.MapControllers();
            app.MapHealthChecks("/health");

            app.Run();
        }
    }
}
