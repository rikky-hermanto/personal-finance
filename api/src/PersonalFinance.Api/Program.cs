
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services;
using PersonalFinance.Infrastructure.Parsers;
using PersonalFinance.Persistence;


namespace PersonalFinance.Api
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.

            builder.Services.AddControllers();
            // Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
            builder.Services.AddOpenApi();

            builder.Services.AddPersistence(builder.Configuration.GetConnectionString("Default")!);
            builder.Services.AddScoped<ITransactionService, TransactionService>();
            builder.Services.AddScoped<CsvTransactionParser>();

            var app = builder.Build();

            // Configure the HTTP request pipeline.
            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
            }

            app.UseHttpsRedirection();

            app.UseAuthorization();


            app.MapControllers();

            app.Run();
        }
    }
}
