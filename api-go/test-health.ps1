# Test Health Check API
# This script tests if the health check endpoint is working

Write-Host "🔍 Testing Health Check API..." -ForegroundColor Green

# Test the health check endpoint
try {
    Write-Host "📡 Testing: http://localhost:7208/api/transactions/health" -ForegroundColor Blue
    
    $response = Invoke-RestMethod -Uri "http://localhost:7208/api/transactions/health" -Method GET -ErrorAction Stop
    
    Write-Host "✅ Health Check Response:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 3) -ForegroundColor Cyan
    
    # Verify response format
    if ($response.status -eq "Healthy") {
        Write-Host "✅ Status: OK" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Unexpected status: $($response.status)" -ForegroundColor Yellow
    }
    
    if ($response.service) {
        Write-Host "✅ Service: $($response.service)" -ForegroundColor Green
    }
    
    if ($response.version) {
        Write-Host "✅ Version: $($response.version)" -ForegroundColor Green
    }
    
} catch {
    Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure the server is running on port 7208" -ForegroundColor Yellow
    
    # Test if something is listening on port 7208
    try {
        $tcpConnection = Test-NetConnection -ComputerName "localhost" -Port 7208 -WarningAction SilentlyContinue
        if ($tcpConnection.TcpTestSucceeded) {
            Write-Host "✅ Port 7208 is open - server might be starting up" -ForegroundColor Yellow
        } else {
            Write-Host "❌ Nothing is listening on port 7208" -ForegroundColor Red
            Write-Host "💡 Try running: node stub-server.cjs" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Could not test port connection" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "🌐 You can also test in your browser:" -ForegroundColor Blue
Write-Host "   http://localhost:7208/api/transactions/health" -ForegroundColor Cyan
Write-Host "   http://localhost:7208/" -ForegroundColor Cyan