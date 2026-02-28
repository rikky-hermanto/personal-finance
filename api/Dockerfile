FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy project files and restore dependencies
COPY PersonalFinance.slnx .
COPY src/PersonalFinance.Api/PersonalFinance.Api.csproj src/PersonalFinance.Api/
COPY src/PersonalFinance.Application/PersonalFinance.Application.csproj src/PersonalFinance.Application/
COPY src/PersonalFinance.Domain/PersonalFinance.Domain.csproj src/PersonalFinance.Domain/
COPY src/PersonalFinance.Infrastructure/PersonalFinance.Infrastructure.csproj src/PersonalFinance.Infrastructure/
COPY src/PersonalFinance.Persistence/PersonalFinance.Persistence.csproj src/PersonalFinance.Persistence/
COPY tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj tests/PersonalFinance.Tests/

RUN dotnet restore PersonalFinance.slnx

# Copy everything else and publish
COPY . .
RUN dotnet publish src/PersonalFinance.Api/PersonalFinance.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

EXPOSE 7208

ENV ASPNETCORE_URLS=http://+:7208

ENTRYPOINT ["dotnet", "PersonalFinance.Api.dll"]
