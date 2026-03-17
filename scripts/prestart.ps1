$ErrorActionPreference = "Continue"

# 1. Check if docker is running
$dockerInfo = docker info 2>&1
if ($dockerInfo -match "error during connect" -or $dockerInfo -match "failed to connect" -or $dockerInfo -match "The system cannot find the file specified") {
    Write-Host "Docker is not running. Starting Docker Desktop..." -ForegroundColor Yellow
    $dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Start-Process $dockerPath
        Write-Host "Waiting for Docker engine to start (this may take up to a minute)..." -ForegroundColor Yellow
        do {
            Start-Sleep -Seconds 5
            $dockerInfo = docker info 2>&1
        } until (-not ($dockerInfo -match "error during connect" -or $dockerInfo -match "failed to connect" -or $dockerInfo -match "The system cannot find the file specified"))
        Write-Host "Docker is now running." -ForegroundColor Green
    } else {
        Write-Host "Docker Desktop executable not found at $dockerPath. Please start Docker manually." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Docker is already running." -ForegroundColor Green
}

# 2. Look up the API port from launchSettings.json
$port = 7208 # Default fallback
$launchSettingsPath = "$PSScriptRoot\..\apps\api\src\PersonalFinance.Api\Properties\launchSettings.json"
if (Test-Path $launchSettingsPath) {
    try {
        $launchSettings = Get-Content $launchSettingsPath -Raw | ConvertFrom-Json
        $httpUrl = $launchSettings.profiles.http.applicationUrl
        if ($httpUrl -match ":(\d+)") {
            $port = $Matches[1]
            Write-Host "Found API port $port in launchSettings.json" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "Could not parse launchSettings.json, falling back to port $port" -ForegroundColor Yellow
    }
} else {
    Write-Host "Could not find launchSettings.json, falling back to port $port" -ForegroundColor Yellow
}

# 3. Stop conflicting processes on the API port (e.g., leftover API processes)
$process = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($process) {
    foreach ($p in $process) {
        if ($p.OwningProcess) {
            Write-Host "Stopping conflicting process on port $port (PID: $($p.OwningProcess))" -ForegroundColor Yellow
            Stop-Process -Id $p.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}
