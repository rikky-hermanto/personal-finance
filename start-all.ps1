# PowerShell script to run Backend, Frontend, and AI Service

Write-Host " Starting Personal Finance App (Full Stack)..." -ForegroundColor Green

# 1. Setup Backend Environment
$backendPath = Join-Path $PSScriptRoot "apps\api\src\PersonalFinance.Api"
if (-not (Test-Path "$backendPath\bin")) {
    Write-Host " Restoring .NET dependencies..." -ForegroundColor Yellow
    dotnet restore "$PSScriptRoot\apps\api\PersonalFinance.slnx"
}

# 2. Start Backend (New Window)
Write-Host " Starting .NET Backend..." -ForegroundColor Cyan
Start-Process cmd -ArgumentList "/k", "cd `"$backendPath`" && dotnet run"

# 3. Setup Frontend Dependencies
$frontendPath = Join-Path $PSScriptRoot "apps\frontend"
if (-not (Test-Path "$frontendPath\node_modules")) {
    Write-Host " Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location $frontendPath; npm install; Pop-Location
}

# 4. Start Frontend (New Window)
Write-Host " Starting React Frontend..." -ForegroundColor Cyan
Start-Process cmd -ArgumentList "/k", "cd `"$frontendPath`" && npm run dev"

# 5. Start AI Service (New Window)
Write-Host " Starting AI Service..." -ForegroundColor Cyan
$aiServicePath = Join-Path $PSScriptRoot "services\ai-service"
Start-Process cmd -ArgumentList "/k", "cd `"$aiServicePath`" && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

Write-Host " All services started in separate windows!" -ForegroundColor Green
Write-Host "   - Backend: http://localhost:7208"
Write-Host "   - Frontend: http://localhost:8080"
Write-Host "   - AI Service: http://localhost:8000"
