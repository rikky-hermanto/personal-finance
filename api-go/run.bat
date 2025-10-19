@echo off
echo 🚀 Starting Personal Finance API (Go)...

REM Check if Go is installed
go version >nul 2>&1
if errorlevel 1 (
    echo ❌ Go is not installed or not in PATH
    echo Please install Go from: https://golang.org/dl/
    echo After installation, restart your terminal and try again
    pause
    exit /b 1
)

REM Show Go version
echo ✅ Go is installed:
go version

REM Change to API directory
cd /d "%~dp0"

REM Set environment variables
set PF_SERVER_PORT=7208
set PF_SERVER_CORS_ALLOWED_ORIGINS=http://localhost:8080
set GIN_MODE=debug

REM Download dependencies
echo 📦 Downloading dependencies...
go mod download
if errorlevel 1 (
    echo ❌ Failed to download dependencies
    pause
    exit /b 1
)

REM Run the API
echo 🌐 Starting server on port %PF_SERVER_PORT%...
echo 🔗 Health check will be available at: http://localhost:%PF_SERVER_PORT%/api/transactions/health
echo 🔗 API root: http://localhost:%PF_SERVER_PORT%/
echo.
echo Press Ctrl+C to stop the server
go run cmd/server/main.go