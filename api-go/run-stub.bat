@echo off
echo 🚀 Starting Health Check API (Node.js Stub)...
echo.
echo ℹ️  This is a temporary solution while Go is not installed.
echo    For the full Go API, please install Go first (see INSTALL-GO.md)
echo.

REM Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed
    echo.
    echo You have two options:
    echo 1. Install Go from: https://golang.org/dl/
    echo 2. Install Node.js from: https://nodejs.org/
    echo.
    echo After installing either one, restart your terminal and try again.
    pause
    exit /b 1
)

echo ✅ Node.js is available
node --version

REM Set environment variables
set PF_SERVER_PORT=7208
set PF_SERVER_CORS_ALLOWED_ORIGINS=http://localhost:8080

echo.
echo 🌐 Starting Node.js stub server on port %PF_SERVER_PORT%...
echo 🔗 Health check: http://localhost:%PF_SERVER_PORT%/api/transactions/health
echo 🔗 Root: http://localhost:%PF_SERVER_PORT%/
echo.
echo Press Ctrl+C to stop the server
node stub-server.cjs