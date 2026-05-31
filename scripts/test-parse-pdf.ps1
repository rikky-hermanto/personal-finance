<#
.SYNOPSIS
    Test POST /parse-pdf against PDFs in docs/statement-examples/.

.PARAMETER BankHint
    Optional bank hint (e.g. "neobank", "superbank"). Omit to auto-detect.

.PARAMETER File
    Optional single PDF path relative to repo root. Defaults to all PDFs in docs/statement-examples/.

.EXAMPLE
    .\scripts\test-parse-pdf.ps1
    .\scripts\test-parse-pdf.ps1 -BankHint superbank
    .\scripts\test-parse-pdf.ps1 -File "docs\statement-examples\superbank_000000000001-2025-06-statement.pdf"
    .\scripts\test-parse-pdf.ps1 -File "docs\statement-examples\e-statement_Sep_2025_8851.pdf" -Password yourpassword
#>

param(
    [string]$BankHint = "",
    [string]$File = "",
    [string]$Password = ""  # suppress PSAvoidUsingPlainTextForPassword — converted to plain text for HTTP form body anyway
)

$ErrorActionPreference = "Stop"
$Root         = Split-Path $PSScriptRoot -Parent
$ServiceDir   = Join-Path $Root "services\ai-service"
$StatementsDir = Join-Path $Root "docs\statement-examples"
$AiUrl        = "http://localhost:8000"
$VenvPython   = Join-Path $ServiceDir ".venv\Scripts\python.exe"

function Test-ServiceRunning {
    try {
        $r = Invoke-RestMethod -Uri "$AiUrl/health" -TimeoutSec 3
        return $r.status -eq "healthy"
    } catch {
        return $false
    }
}

# --- 1. Verify .env exists ---

Write-Host ""
Write-Host "--- Checking prerequisites ---" -ForegroundColor Cyan

$EnvFile = Join-Path $ServiceDir ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "FAIL: .env not found at $EnvFile" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Create it with:" -ForegroundColor Gray
    Write-Host "    AI_PROVIDER=anthropic" -ForegroundColor Gray
    Write-Host "    ANTHROPIC_API_KEY=sk-ant-..." -ForegroundColor Gray
    exit 1
}
Write-Host "  OK: .env found" -ForegroundColor Green

# --- 2. Start service if not running ---

Write-Host ""
Write-Host "--- AI service ---" -ForegroundColor Cyan

$ServiceStarted = $false

if (Test-ServiceRunning) {
    Write-Host "  OK: already running at $AiUrl" -ForegroundColor Green
} else {
    Write-Host "  Starting uvicorn..." -ForegroundColor Yellow

    if (-not (Test-Path $VenvPython)) {
        Write-Host "FAIL: venv not found at $VenvPython" -ForegroundColor Red
        Write-Host "  Run: cd services/ai-service && pip install -e `".[dev]`"" -ForegroundColor Gray
        exit 1
    }

    $ServiceJob = Start-Job -ScriptBlock {
        param($dir, $py)
        Set-Location $dir
        & $py -m uvicorn app.main:app --port 8000
    } -ArgumentList $ServiceDir, $VenvPython

    $ServiceStarted = $true

    Write-Host "  Waiting for service" -NoNewline
    $attempts = 0
    while (-not (Test-ServiceRunning)) {
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline
        $attempts++
        if ($attempts -ge 20) {
            Write-Host ""
            Write-Host "FAIL: service did not start within 20s" -ForegroundColor Red
            Receive-Job $ServiceJob | Write-Host
            Stop-Job $ServiceJob; Remove-Job $ServiceJob
            exit 1
        }
    }
    Write-Host ""
    Write-Host "  OK: service ready" -ForegroundColor Green
}

# --- 3. Resolve PDF list ---

Write-Host ""
Write-Host "--- PDF files ---" -ForegroundColor Cyan

if ($File -ne "") {
    $Pdfs = @(Get-Item (Join-Path $Root $File))
} else {
    $Pdfs = @(Get-ChildItem -Path $StatementsDir -Filter "*.pdf" -ErrorAction SilentlyContinue)
}

if ($Pdfs.Count -eq 0) {
    Write-Host "FAIL: no PDFs found in $StatementsDir" -ForegroundColor Red
    exit 1
}

foreach ($pdf in $Pdfs) {
    Write-Host "  $($pdf.Name)  ($([math]::Round($pdf.Length / 1024, 1)) KB)" -ForegroundColor White
}

# --- 4. Send each PDF ---

Add-Type -AssemblyName System.Net.Http

function Send-Pdf {
    param(
        [System.IO.FileInfo]$Pdf,
        [string]$Hint,
        [string]$Pass
    )

    $client  = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [System.TimeSpan]::FromSeconds(120)
    $content = [System.Net.Http.MultipartFormDataContent]::new()

    $fileBytes   = [System.IO.File]::ReadAllBytes($Pdf.FullName)
    $fileContent = [System.Net.Http.ByteArrayContent]::new($fileBytes)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/pdf")
    $content.Add($fileContent, "file", $Pdf.Name)

    if ($Hint -ne "") { $content.Add([System.Net.Http.StringContent]::new($Hint), "bank_hint") }
    if ($Pass -ne "") { $content.Add([System.Net.Http.StringContent]::new($Pass), "password") }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = $client.PostAsync("$AiUrl/parse-pdf", $content).GetAwaiter().GetResult()
        $body     = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        return [PSCustomObject]@{
            StatusCode = [int]$response.StatusCode
            Body       = $body
            Elapsed    = [math]::Round($sw.Elapsed.TotalSeconds, 1)
        }
    } finally {
        $client.Dispose()
    }
}

$Results = @()

foreach ($pdf in $Pdfs) {
    Write-Host ""
    Write-Host "--- Testing: $($pdf.Name) ---" -ForegroundColor Cyan

    if ($BankHint -ne "") { Write-Host "  bank_hint = $BankHint" -ForegroundColor Gray }

    try {
        $pass = $Password
        $r    = Send-Pdf -Pdf $pdf -Hint $BankHint -Pass $pass

        # If password-protected, prompt up to 3 times
        if ($r.StatusCode -eq 422 -and ($r.Body | ConvertFrom-Json).detail -like "*password-protected*") {
            Write-Host "  This PDF is password-protected." -ForegroundColor Yellow

            $maxAttempts = 3
            $attempt     = 0

            while ($attempt -lt $maxAttempts) {
                $attempt++
                $pass = Read-Host "  Enter password (attempt $attempt of $maxAttempts)"
                Write-Host "  Retrying..." -ForegroundColor Gray
                $r = Send-Pdf -Pdf $pdf -Hint $BankHint -Pass $pass

                if ($r.StatusCode -eq 200) { break }

                $detail = try { ($r.Body | ConvertFrom-Json).detail } catch { $r.Body }

                if ($r.StatusCode -eq 422 -and $detail -like "*password*") {
                    if ($attempt -lt $maxAttempts) {
                        Write-Host "  Wrong password — please try again." -ForegroundColor Red
                    } else {
                        Write-Host "  Wrong password — 3 attempts exhausted." -ForegroundColor Red
                    }
                } else {
                    # Different error (not a password error) — stop retrying
                    break
                }
            }
        }
    } catch {
        Write-Host "  FAIL: $_" -ForegroundColor Red
        $Results += [PSCustomObject]@{
            File = $pdf.Name; Status = "ERROR"
            Pages = "-"; Parsed = "-"; Skipped = "-"; ElapsedSec = "-"
        }
        continue
    }

    if ($r.StatusCode -eq 200) {
        $json = $r.Body | ConvertFrom-Json

        Write-Host "  OK: HTTP 200  ($($r.Elapsed)s)" -ForegroundColor Green
        Write-Host "  pages_processed : $($json.pages_processed)" -ForegroundColor White
        Write-Host "  total_parsed    : $($json.total_parsed)"    -ForegroundColor White
        Write-Host "  skipped_rows    : $($json.skipped_rows)"    -ForegroundColor White

        if ($json.transactions.Count -gt 0) {
            Write-Host ""
            Write-Host "  First 3 transactions:" -ForegroundColor Gray
            $json.transactions | Select-Object -First 3 | ForEach-Object {
                Write-Host ("  {0,-12}  {1,-4}  {2,15:N0} IDR  {3}" -f `
                    $_.date, $_.flow, $_.amount_idr, $_.description) -ForegroundColor White
            }
        }

        $Results += [PSCustomObject]@{
            File       = $pdf.Name
            Status     = "OK"
            Pages      = $json.pages_processed
            Parsed     = $json.total_parsed
            Skipped    = $json.skipped_rows
            ElapsedSec = $r.Elapsed
        }
    } else {
        Write-Host "  FAIL: HTTP $($r.StatusCode)" -ForegroundColor Red
        Write-Host "  $($r.Body)" -ForegroundColor Red

        $Results += [PSCustomObject]@{
            File       = $pdf.Name
            Status     = "HTTP $($r.StatusCode)"
            Pages      = "-"; Parsed = "-"; Skipped = "-"; ElapsedSec = $r.Elapsed
        }
    }
}

# --- 5. Summary ---

Write-Host ""
Write-Host "--- Summary ---" -ForegroundColor Cyan
$Results | Format-Table -AutoSize

# --- 6. Stop service if we started it ---

if ($ServiceStarted) {
    Write-Host "Stopping AI service..." -ForegroundColor Gray
    Get-Job | Where-Object { $_.State -eq "Running" } | Stop-Job
    Get-Job | Remove-Job -Force
    $proc = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    if ($proc) { Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue }
    Write-Host "  OK: AI service stopped" -ForegroundColor Green
}
