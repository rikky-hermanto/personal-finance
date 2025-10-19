# Quick Start Guide - Running the Health Check API

## Prerequisites

You need to install Go first. Follow these steps:

### 1. Install Go

**Windows:**
1. Download Go from: https://golang.org/dl/
2. Choose "Microsoft Windows" and download the `.msi` installer
3. Run the installer and follow the setup wizard
4. Restart your terminal/PowerShell after installation

**Verify Installation:**
```powershell
go version
```
You should see something like: `go version go1.21.0 windows/amd64`

### 2. Install Dependencies

Navigate to the API directory and install dependencies:

```powershell
cd api-go
go mod download
```

### 3. Run the API

**Option 1: Using the batch script (Windows)**
```powershell
.\run.bat
```

**Option 2: Manual run**
```powershell
# Set environment variables
$env:PF_SERVER_PORT="7208"
$env:PF_SERVER_CORS_ALLOWED_ORIGINS="http://localhost:8080"

# Run the server
go run cmd/server/main.go
```

**Option 3: Using PowerShell script**
```powershell
.\run.ps1
```

### 4. Test the Health Check

Once the server is running, test these endpoints:

**Health Check:**
```
GET http://localhost:7208/api/transactions/health
```

**Root Endpoint:**
```
GET http://localhost:7208/
```

**Using curl:**
```bash
curl http://localhost:7208/api/transactions/health
```

**Using PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:7208/api/transactions/health"
```

**Using browser:**
Open: http://localhost:7208/api/transactions/health

### Expected Response

The health check should return:
```json
{
  "status": "Healthy",
  "timestamp": "2025-10-19T...",
  "version": "1.0.0",
  "service": "Personal Finance API (Go)"
}
```

## Features Included

- ✅ Health check endpoint at `/api/transactions/health`
- ✅ CORS middleware configured for frontend compatibility
- ✅ JSON response format
- ✅ Environment variable configuration
- ✅ Proper error handling and logging

## Troubleshooting

**Go not found:**
- Install Go from https://golang.org/dl/
- Restart your terminal after installation
- Verify with `go version`

**Port already in use:**
- Change the port: `$env:PF_SERVER_PORT="7209"`
- Or stop the process using port 7208

**Permission denied:**
- Run PowerShell as Administrator
- Or use a port above 1024

## Next Steps

Once the health check is working, you can proceed with implementing:
1. Database connection
2. Full transaction endpoints
3. Category rules management
4. Bank statement parsing

The minimal API is now ready and provides a solid foundation for the complete implementation!