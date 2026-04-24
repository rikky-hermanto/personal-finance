# PowerShell script to run both Backend and Frontend

Write-Host " Starting Personal Finance App (Full Stack)..." -ForegroundColor Green

# 1. Setup Backend Environment
$backendPath = Join-Path $PSScriptRoot "apps\api\src\PersonalFinance.Api"
if (-not (Test-Path "$backendPath\bin")) {
    Write-Host " Restoring .NET dependencies..." -ForegroundColor Yellow
    dotnet restore "$PSScriptRoot\apps\api\PersonalFinance.slnx"
}

# 2. Start Backend (New Window)
Write-Host " Starting .NET Backend..." -ForegroundColor Cyan
Start-Process cmd -ArgumentList "/k", "cd `"$backendPath`" && dotnet run > `"C:\workspaces\personal-finance\backend.log`" 2>&1"

# 3. Setup Frontend Dependencies
$frontendPath = Join-Path $PSScriptRoot "apps\frontend"
if (-not (Test-Path "$frontendPath\node_modules")) {
    Write-Host " Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location $frontendPath; npm install; Pop-Location
}

# 4. Start Frontend (New Window)
Write-Host "  Starting React Frontend..." -ForegroundColor Cyan
Start-Process cmd -ArgumentList "/k", "cd `"$frontendPath`" && npm run dev"

Write-Host " All services started!" -ForegroundColor Green
Write-Host "   - Backend: http://localhost:7208"
Write-Host "   - Frontend: http://localhost:8080"
