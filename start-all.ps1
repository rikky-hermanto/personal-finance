# PowerShell script to run both Backend and Frontend

Write-Host "🚀 Starting Personal Finance App (Full Stack)..." -ForegroundColor Green

# 1. Setup Backend Environment
$backendPath = Join-Path $PSScriptRoot "api\src\PersonalFinance.Api"
if (-not (Test-Path "$backendPath\bin")) {
    Write-Host "� Restoring .NET dependencies..." -ForegroundColor Yellow
    dotnet restore "$PSScriptRoot\api\personal-finance.sln"
}

# 2. Start Backend (New Window)
Write-Host "🔙 Starting .NET Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; dotnet run"

# 3. Setup Frontend Dependencies
if (-not (Test-Path "$PSScriptRoot\node_modules")) {
    Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
}

# 4. Start Frontend (New Window)
Write-Host "🖥️  Starting React Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev"

Write-Host "✅ All services started!" -ForegroundColor Green
Write-Host "   - Backend: http://localhost:7208"
Write-Host "   - Frontend: http://localhost:8080"
