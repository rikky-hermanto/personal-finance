# PowerShell script to run both Backend and Frontend

Write-Host "🚀 Starting Personal Finance App (Full Stack)..." -ForegroundColor Green

# 1. Setup Backend Environment
$backendPath = Join-Path $PSScriptRoot "api-go"
if (-not (Test-Path "$backendPath\.env")) {
    Write-Host "📝 Creating backend .env from example..." -ForegroundColor Yellow
    Copy-Item "$backendPath\.env.example" "$backendPath\.env"
}

# 2. Start Backend (New Window)
Write-Host "🔙 Starting Go Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; .\run.ps1"

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
