using PersonalFinance.Api.Extensions;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services;
using PersonalFinance.Infrastructure.External;
using PersonalFinance.Application.Investments;
using PersonalFinance.Infrastructure.Parsers;
using PersonalFinance.Infrastructure.Services;
using PersonalFinance.Infrastructure.Supabase;
using FluentValidation;
using FluentValidation.AspNetCore;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using OpenTelemetry.Logs;
using Npgsql;
using HealthChecks.UI.Client;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;



namespace PersonalFinance.Api
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddControllers();

            var connectionString = builder.Configuration.GetConnectionString("Default") ?? 
                                 builder.Configuration["ConnectionStrings:Default"] ?? 
                                 "Host=localhost;Database=personal_finance;Username=postgres;Password=postgres_password_here";

            builder.Services.AddHealthChecks()
                .AddNpgSql(connectionString, name: "Database")
                .AddUrlGroup(new Uri($"{builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000"}/health"), name: "AI Service")
                .AddUrlGroup(new Uri("http://localhost:3000/api/health"), name: "Grafana Monitoring");

            // Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
            builder.Services.AddOpenApi();

            // OpenTelemetry Configuration
            var otelEndpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "http://localhost:4317";
            var serviceName = builder.Configuration["OTEL_SERVICE_NAME"] ?? "api";

            builder.Services.AddOpenTelemetry()
                .ConfigureResource(resource => resource.AddService(serviceName))
                .WithTracing(tracing => tracing
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddNpgsql()
                    .AddOtlpExporter(options => options.Endpoint = new Uri(otelEndpoint)))
                .WithMetrics(metrics => metrics
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation()
                    .AddOtlpExporter(options => options.Endpoint = new Uri(otelEndpoint)));

            builder.Logging.AddOpenTelemetry(logging =>
            {
                logging.IncludeFormattedMessage = true;
                logging.IncludeScopes = true;
                logging.SetResourceBuilder(ResourceBuilder.CreateDefault().AddService(serviceName));
                logging.AddOtlpExporter(options => options.Endpoint = new Uri(otelEndpoint));
            });


            builder.Services.AddSupabase(builder.Configuration);
            builder.Services.AddHttpClient<ILlmExtractionClient, LlmExtractionClient>(client =>
            {
                client.BaseAddress = new Uri(
                    builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                client.Timeout = TimeSpan.FromMinutes(2);
            });
            builder.Services.AddHttpClient<ILlmCategorizationClient, LlmCategorizationClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                client.Timeout = TimeSpan.FromSeconds(15);
            });
            builder.Services.AddHttpClient<ILlmSuggestionClient, LlmSuggestionClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
            });
            builder.Services.AddHttpClient<IPortfolioReviewClient, PortfolioReviewClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                client.Timeout = TimeSpan.FromMinutes(2);
            });
            builder.Services.AddScoped<CsvTransactionParser>();
            builder.Services.AddScoped<BcaCsvParser>();
            builder.Services.AddScoped<NeoBankPdfParser>();
            builder.Services.AddScoped<DefaultCsvParser>();
            builder.Services.AddScoped<LlmPdfParser>();
            builder.Services.AddScoped<IStatementImportService>(serviceProvider =>
            {
                var parsers = new Dictionary<string, IBankStatementParser>
                {
                    { "BCA", serviceProvider.GetRequiredService<BcaCsvParser>() },
                    { "NEOBANK", serviceProvider.GetRequiredService<NeoBankPdfParser>() },
                    { "STANDARD", serviceProvider.GetRequiredService<DefaultCsvParser>() },
                    { "LLM_PDF", serviceProvider.GetRequiredService<LlmPdfParser>() },
                };
                return new StatementImportService(parsers, serviceProvider.GetRequiredService<ILogger<StatementImportService>>());
            });
            builder.Services.AddScoped<ICategoryRuleService, CategoryRuleService>();
            builder.Services.AddScoped<ICategoryPresetService, PersonalFinance.Application.Services.CategoryPresetService>();
            builder.Services.AddScoped<IBankIdentifier, BankIdentifier>();
            builder.Services.AddScoped<ITransactionService, TransactionService>();
            builder.Services.AddScoped<ITransactionPipelineService, PersonalFinance.Application.Services.TransactionPipelineService>();
            builder.Services.AddScoped<IDashboardService, DashboardService>();
            builder.Services.AddScoped<ISpendingAnalysisService, SpendingAnalysisService>();

            // Assets module services
            builder.Services.AddHttpClient<JisdorFxRateService>();
            builder.Services.AddScoped<IFxRateService, JisdorFxRateService>();
            builder.Services.AddScoped<IValuationService, ValuationService>();
            builder.Services.AddScoped<INetWorthService, NetWorthService>();

            // Journey module
            builder.Services.AddScoped<IInsightService, InsightService>();
            builder.Services.AddScoped<IJourneyScoringService, JourneyScoringService>();
            builder.Services.AddHttpClient<IJourneyAdvisorClient, JourneyAdvisorClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                client.Timeout = TimeSpan.FromSeconds(120);
            });
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
                    policy.WithOrigins("http://localhost:8080", "http://localhost:8081", "http://localhost:8082")
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
            app.MapHealthChecks("/health", new HealthCheckOptions
            {
                ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
            });

            app.Run();
        }
    }
}
