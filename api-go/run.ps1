# PowerShell script to run Personal Finance API

Write-Host "🚀 Starting Personal Finance API (Go)..." -ForegroundColor Green

# Check if Go is installed
try {
    $goVersion = go version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Go is installed: $goVersion" -ForegroundColor Green
    } else {
        throw "Go not found"
    }
} catch {
    Write-Host "❌ Go is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Go from: https://golang.org/dl/" -ForegroundColor Yellow
    Write-Host "After installation, restart your terminal and try again" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Change to script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Set environment variables
$env:PF_SERVER_PORT = "7208"
$env:PF_SERVER_CORS_ALLOWED_ORIGINS = "http://localhost:8080"
$env:GIN_MODE = "debug"

Write-Host "📦 Downloading dependencies..." -ForegroundColor Blue
go mod download
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to download dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "🌐 Starting server on port $env:PF_SERVER_PORT..." -ForegroundColor Green
Write-Host "🔗 Health check: http://localhost:$env:PF_SERVER_PORT/api/transactions/health" -ForegroundColor Cyan
Write-Host "🔗 API root: http://localhost:$env:PF_SERVER_PORT/" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow

go run cmd/server/main.go