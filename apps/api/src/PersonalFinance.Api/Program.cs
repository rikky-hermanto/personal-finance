using PersonalFinance.Api.Extensions;
using PersonalFinance.Application.Behaviors;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services;
using PersonalFinance.Application.Services.Desk;
using PersonalFinance.Infrastructure.External;
using PersonalFinance.Application.Investments;
using PersonalFinance.Infrastructure.Parsers;
using PersonalFinance.Infrastructure.Parsers.Signatures;
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
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using PersonalFinance.Api.Authentication;
using System.Security.Claims;
using System.Text;



namespace PersonalFinance.Api
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddControllers();

            builder.Services.AddHttpContextAccessor();
            builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
            builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    var supabaseUrl = builder.Configuration["Supabase:Url"]?.TrimEnd('/');
                    if (string.IsNullOrWhiteSpace(supabaseUrl))
                        throw new InvalidOperationException("Supabase URL must be configured for the Cashflow pilot.");
                    var issuer = builder.Configuration["Supabase:JwtIssuer"] ?? $"{supabaseUrl}/auth/v1";
                    var audience = builder.Configuration["Supabase:JwtAudience"] ?? "authenticated";
                    var validationMode = builder.Configuration["Supabase:JwtValidationMode"] ?? "Jwks";
                    options.MapInboundClaims = false;
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuerSigningKey = true,
                        ValidateIssuer = true,
                        ValidIssuer = issuer,
                        ValidateAudience = true,
                        ValidAudience = audience,
                        ValidateLifetime = true,
                        ClockSkew = TimeSpan.Zero,
                        RequireExpirationTime = true,
                        RequireSignedTokens = true
                    };
                    if (validationMode.Equals("Jwks", StringComparison.OrdinalIgnoreCase))
                    {
                        // Supabase Auth publishes its current asymmetric verification keys here.
                        // JwtBearer's discovery manager handles caching and key rotation.
                        options.Authority = issuer;
                        options.MetadataAddress = $"{issuer}/.well-known/openid-configuration";
                        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
                        options.TokenValidationParameters.ValidAlgorithms =
                            [SecurityAlgorithms.EcdsaSha256, SecurityAlgorithms.RsaSha256];
                    }
                    else if (validationMode.Equals("LegacySecret", StringComparison.OrdinalIgnoreCase))
                    {
                        var jwtSecret = builder.Configuration["Supabase:JwtSecret"];
                        if (string.IsNullOrWhiteSpace(jwtSecret))
                            throw new InvalidOperationException("A legacy JWT secret is required in LegacySecret validation mode.");
                        options.TokenValidationParameters.IssuerSigningKey =
                            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
                        options.TokenValidationParameters.ValidAlgorithms = [SecurityAlgorithms.HmacSha256];
                    }
                    else
                    {
                        throw new InvalidOperationException("Supabase JWT validation mode must be Jwks or LegacySecret.");
                    }
                    options.Events = new JwtBearerEvents
                    {
                        OnTokenValidated = context =>
                        {
                            var subject = context.Principal?.FindFirstValue("sub");
                            var role = context.Principal?.FindFirstValue("role");
                            if (role != "authenticated" || !Guid.TryParse(subject, out var id) || id == Guid.Empty)
                                context.Fail("A valid authenticated user subject is required.");
                            return Task.CompletedTask;
                        }
                    };
                });
            builder.Services.AddAuthorization(options =>
            {
                options.FallbackPolicy = new AuthorizationPolicyBuilder()
                    .RequireAuthenticatedUser().Build();
            });

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
            builder.Services.AddHttpClient<ICashflowMutationService, SupabaseCashflowMutationService>();
            builder.Services.AddHttpClient<ILlmExtractionClient, LlmExtractionClient>(client =>
            {
                client.BaseAddress = new Uri(
                    builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                client.Timeout = TimeSpan.FromMinutes(2);
                var internalAiKey = builder.Configuration["AiService:InternalApiKey"];
                if (!string.IsNullOrWhiteSpace(internalAiKey)) client.DefaultRequestHeaders.Add("X-Internal-Api-Key", internalAiKey);
            });
            builder.Services.AddHttpClient<ILlmCategorizationClient, LlmCategorizationClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                client.Timeout = TimeSpan.FromSeconds(15);
                var internalAiKey = builder.Configuration["AiService:InternalApiKey"];
                if (!string.IsNullOrWhiteSpace(internalAiKey)) client.DefaultRequestHeaders.Add("X-Internal-Api-Key", internalAiKey);
            });
            builder.Services.AddHttpClient<ILlmSuggestionClient, LlmSuggestionClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                var internalAiKey = builder.Configuration["AiService:InternalApiKey"];
                if (!string.IsNullOrWhiteSpace(internalAiKey)) client.DefaultRequestHeaders.Add("X-Internal-Api-Key", internalAiKey);
            });
            builder.Services.AddHttpClient<IPortfolioReviewClient, PortfolioReviewClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                client.Timeout = TimeSpan.FromMinutes(2);
                var internalAiKey = builder.Configuration["AiService:InternalApiKey"];
                if (!string.IsNullOrWhiteSpace(internalAiKey)) client.DefaultRequestHeaders.Add("X-Internal-Api-Key", internalAiKey);
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
                    { BankKeys.Bca, serviceProvider.GetRequiredService<BcaCsvParser>() },
                    { BankKeys.NeoBank, serviceProvider.GetRequiredService<NeoBankPdfParser>() },
                    { BankKeys.Superbank, serviceProvider.GetRequiredService<LlmPdfParser>() },
                    { BankKeys.Standard, serviceProvider.GetRequiredService<DefaultCsvParser>() },
                    { BankKeys.LlmPdf, serviceProvider.GetRequiredService<LlmPdfParser>() },
                };
                return new StatementImportService(parsers, serviceProvider.GetRequiredService<ILogger<StatementImportService>>());
            });
            builder.Services.AddScoped<ICategoryRuleService, CategoryRuleService>();
            builder.Services.AddScoped<ICategoryPresetService, PersonalFinance.Application.Services.CategoryPresetService>();
            // Bank identification signatures — order within each content-type group matters (first match wins)
            builder.Services.AddScoped<IBankSignature, BcaCsvSignature>();
            builder.Services.AddScoped<IBankSignature, StandardCsvSignature>();
            builder.Services.AddScoped<IBankSignature, NeoBankPdfSignature>();
            builder.Services.AddScoped<IBankSignature, SuperbankPdfSignature>();
            builder.Services.AddScoped<IBankIdentifier, BankIdentifier>();
            // PF-144 (SEC-02): magic-byte check before parsing, and a time budget around parsing.
            builder.Services.AddScoped<IUploadFileValidator, UploadFileValidator>();
            builder.Services.Configure<PersonalFinance.Api.Models.UploadOptions>(
                builder.Configuration.GetSection(PersonalFinance.Api.Models.UploadOptions.SectionName));
            builder.Services.AddScoped<ITransactionService, TransactionService>();
            builder.Services.AddScoped<ITransactionPipelineService, PersonalFinance.Application.Services.TransactionPipelineService>();
            builder.Services.AddScoped<IDashboardService, DashboardService>();
            builder.Services.AddScoped<ISpendingAnalysisService, SpendingAnalysisService>();
            builder.Services.AddScoped<IBucketsService, PersonalFinance.Application.Services.Buckets.BucketsService>();

            // Assets module services
            builder.Services.AddHttpClient<JisdorFxRateService>();
            builder.Services.AddScoped<IFxRateService, JisdorFxRateService>();
            builder.Services.AddScoped<IValuationService, ValuationService>();
            builder.Services.AddScoped<INetWorthService, NetWorthService>();

            // Trading Desk module (PF-133)
            builder.Services.AddScoped<IDeskService, DeskService>();
            builder.Services.AddScoped<IDeskMandateService, DeskMandateService>();

            // Macro Scenario Lab (PF-140)
            builder.Services.AddScoped<IMacroScenarioService, MacroScenarioService>();

            // Journey module
            // "Today" and "this month" are the owner's calendar (Asia/Jakarta), not the host's UTC.
            builder.Services.AddSingleton<TimeProvider>(AppTimeProvider.Jakarta());
            builder.Services.AddScoped<IInsightService, InsightService>();
            builder.Services.AddScoped<IJourneyScoringService, JourneyScoringService>();
            builder.Services.AddScoped<IJourneyConfirmationService, JourneyConfirmationService>();
            builder.Services.AddHttpClient<IJourneyAdvisorClient, JourneyAdvisorClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                client.Timeout = TimeSpan.FromSeconds(120);
                var internalAiKey = builder.Configuration["AiService:InternalApiKey"];
                if (!string.IsNullOrWhiteSpace(internalAiKey)) client.DefaultRequestHeaders.Add("X-Internal-Api-Key", internalAiKey);
            });
            // PF-S15: owner-scoped AI routes need the internal key AND a signed owner token.
            builder.Services.AddSingleton(new OwnerTokenSigner(
                builder.Configuration["AiChat:OwnerSigningSecret"], TimeProvider.System));
            builder.Services.AddHttpClient<ILlmSearchClient, LlmSearchClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                client.Timeout = TimeSpan.FromSeconds(60);
                var internalAiKey = builder.Configuration["AiService:InternalApiKey"];
                if (!string.IsNullOrWhiteSpace(internalAiKey)) client.DefaultRequestHeaders.Add("X-Internal-Api-Key", internalAiKey);
            });
            builder.Services.AddHttpClient<IAiChatClient, AiChatClient>(client =>
            {
                client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
                client.Timeout = TimeSpan.FromMinutes(2);
                var internalAiKey = builder.Configuration["AiService:InternalApiKey"];
                if (!string.IsNullOrWhiteSpace(internalAiKey)) client.DefaultRequestHeaders.Add("X-Internal-Api-Key", internalAiKey);
            });
            builder.Services.AddMediatR(cfg =>
            {
                cfg.RegisterServicesFromAssemblyContaining<Program>();
                cfg.RegisterServicesFromAssemblyContaining<CreateTransactionCommandHandler>();
                cfg.AddOpenBehavior(typeof(PublishAssetUpdatedBehavior<,>));
            });

            // Register FluentValidation
            builder.Services.AddValidatorsFromAssemblyContaining<CreateTransactionCommandValidator>();
            builder.Services.AddValidatorsFromAssemblyContaining<CreateCategoryRuleCommandValidator>();
            builder.Services.AddValidatorsFromAssembly(typeof(Program).Assembly);
            builder.Services.AddFluentValidationAutoValidation();

            var browserOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                ?? ["http://localhost:8080", "http://localhost:8081", "http://localhost:8082"];
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("CashflowBrowserOrigins", policy =>
                {
                    policy.WithOrigins(browserOrigins)
                          .AllowAnyHeader()
                          .AllowAnyMethod();
                });
            });

            var app = builder.Build();
            var cashflowPilotEnabled = builder.Configuration.GetValue<bool>("CashflowPilot:Enabled");
            var checkedMutationsEnabled = builder.Configuration.GetValue<bool>("CashflowPilot:CheckedMutationsEnabled");
            if (cashflowPilotEnabled && string.IsNullOrWhiteSpace(app.Configuration["AiService:InternalApiKey"]))
                throw new InvalidOperationException("An internal AI service key is required for the Cashflow pilot.");
            var aiChatEnabled = cashflowPilotEnabled && builder.Configuration.GetValue<bool>("AiChat:Enabled");
            if (aiChatEnabled && string.IsNullOrWhiteSpace(app.Configuration["AiChat:OwnerSigningSecret"]))
                throw new InvalidOperationException("AiChat:OwnerSigningSecret is required when AI chat is enabled.");

            // Configure the HTTP request pipeline.
            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
            }

            app.UseHttpsRedirection();

            // Enable CORS for the specified UI origin
            app.UseCors("CashflowBrowserOrigins");

            //Extensions Middleware
            app.UseApiExceptionHandler();  

            app.UseAuthentication();
            app.Use(async (context, next) =>
            {
                // Fail closed: only owner-scoped modules are served.
                var path = context.Request.Path;
                // Reopened modules write directly under owner-only RLS (no checked RPCs needed).
                var ownerScopedModule = path.StartsWithSegments("/api/assets") ||
                              path.StartsWithSegments("/api/liabilities") ||
                              path.StartsWithSegments("/api/networth") ||
                              path.StartsWithSegments("/api/investments") ||
                              path.StartsWithSegments("/api/journey") ||
                              path.StartsWithSegments("/api/desk") ||
                              path.StartsWithSegments("/api/macro-scenarios");
                // PF-S15: chat forwards to owner-scoped AI routes; ChatController also 404s when off.
                var chatRoute = aiChatEnabled && path.StartsWithSegments("/api/chat");
                var allowed = cashflowPilotEnabled && (path.StartsWithSegments("/api/transactions") &&
                              !path.StartsWithSegments("/api/transactions/upload-preview-new") ||
                              path.StartsWithSegments("/api/accounts") ||
                              path.StartsWithSegments("/api/categoryrules") ||
                              path.StartsWithSegments("/api/buckets") ||
                              path.StartsWithSegments("/api/spending-analysis") ||
                              path.StartsWithSegments("/api/insights") ||
                              ownerScopedModule || chatRoute) ||
                              !path.StartsWithSegments("/api");
                if (!allowed)
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }
                // Only installed checked RPC routes may be opened for isolated validation.
                // Other mutations and full pilot release remain pending.
                var preview = path.StartsWithSegments("/api/transactions/upload-preview") ||
                              path.StartsWithSegments("/api/transactions/categorize-preview");
                var segments = path.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries) ?? [];
                var accountItem = segments.Length == 3 &&
                    string.Equals(segments[0], "api", StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(segments[1], "accounts", StringComparison.OrdinalIgnoreCase) &&
                    Guid.TryParse(segments[2], out _);
                var institutionItem = segments.Length == 4 &&
                    string.Equals(segments[0], "api", StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(segments[1], "accounts", StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(segments[2], "institutions", StringComparison.OrdinalIgnoreCase) &&
                    Guid.TryParse(segments[3], out _);
                var accountSetting = segments.Length == 4 &&
                    string.Equals(segments[0], "api", StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(segments[1], "accounts", StringComparison.OrdinalIgnoreCase) &&
                    Guid.TryParse(segments[2], out _) &&
                    (string.Equals(segments[3], "cashflow", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(segments[3], "opening-balance", StringComparison.OrdinalIgnoreCase));
                var ruleItem = segments.Length == 3 &&
                    string.Equals(segments[0], "api", StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(segments[1], "categoryrules", StringComparison.OrdinalIgnoreCase) &&
                    int.TryParse(segments[2], out var ruleId) && ruleId > 0;
                var checkedMutation = checkedMutationsEnabled && (
                    (HttpMethods.IsPost(context.Request.Method) &&
                     string.Equals(path.Value, "/api/transactions/submit", StringComparison.OrdinalIgnoreCase)) ||
                    (HttpMethods.IsPost(context.Request.Method) &&
                     (string.Equals(path.Value, "/api/accounts", StringComparison.OrdinalIgnoreCase) ||
                      string.Equals(path.Value, "/api/accounts/institutions", StringComparison.OrdinalIgnoreCase))) ||
                    (HttpMethods.IsPost(context.Request.Method) &&
                     (string.Equals(path.Value, "/api/categoryrules", StringComparison.OrdinalIgnoreCase) ||
                      string.Equals(path.Value, "/api/categoryrules/import", StringComparison.OrdinalIgnoreCase) ||
                      string.Equals(path.Value, "/api/buckets/future-plan", StringComparison.OrdinalIgnoreCase) ||
                      string.Equals(path.Value, "/api/buckets/committed-items/demote", StringComparison.OrdinalIgnoreCase))) ||
                    (HttpMethods.IsPut(context.Request.Method) &&
                     (accountItem || institutionItem || ruleItem)) ||
                    (HttpMethods.IsPatch(context.Request.Method) && accountSetting) ||
                    (HttpMethods.IsDelete(context.Request.Method) &&
                     (accountItem || institutionItem || ruleItem ||
                      string.Equals(path.Value, "/api/categoryrules/reset", StringComparison.OrdinalIgnoreCase))) ||
                    (HttpMethods.IsDelete(context.Request.Method) &&
                     string.Equals(path.Value, "/api/transactions/reset", StringComparison.OrdinalIgnoreCase)));
                if (path.StartsWithSegments("/api") &&
                    !HttpMethods.IsGet(context.Request.Method) &&
                    !HttpMethods.IsHead(context.Request.Method) &&
                    !(HttpMethods.IsPost(context.Request.Method) && preview) &&
                    !checkedMutation &&
                    !ownerScopedModule &&
                    !chatRoute)
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }
                await next(context);
            });
            app.UseAuthorization();

            app.MapControllers();
            app.MapHealthChecks("/health", new HealthCheckOptions
            {
                ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
            }).AllowAnonymous();

            app.Run();
        }
    }
}
