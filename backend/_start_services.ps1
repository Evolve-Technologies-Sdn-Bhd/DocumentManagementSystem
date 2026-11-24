$wd = 'c:\Users\USER\Desktop\DocumentManagementSystem'
$backendDir = "$wd\backend"
$frontendDir = "$wd\frontend"
$statusFile = "$backendDir\_smoke_cal.json"

$ErrorActionPreference = 'Continue'

Write-Output "=== PowerShell Service Launcher ==="
Write-Output "WD: $wd"

# ---- Port 4001 kill ----
Write-Output "`n--- Kill port 4001 listeners ---"
$pids4001 = netstat -ano | Select-String ':4001' | ForEach-Object { if ($_ -match 'LISTENING\s+(\d+)') { [int]$matches[1] } } | Select-Object -Unique
if ($pids4001) { foreach ($p in $pids4001) { Write-Output "Killing :4001 PID=$p"; Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } } else { Write-Output "No listeners on :4001" }

# ---- Port 5173 kill (optional) ----
Write-Output "`n--- Kill port 5173 listeners ---"
$pids5173 = netstat -ano | Select-String ':5173' | ForEach-Object { if ($_ -match 'LISTENING\s+(\d+)') { [int]$matches[1] } } | Select-Object -Unique
if ($pids5173) { foreach ($p in $pids5173) { Write-Output "Killing :5173 PID=$p"; Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } } else { Write-Output "No listeners on :5173" }

Start-Sleep -Seconds 2

# ---- Start Backend ----
Write-Output "`n--- Starting Backend (node src/index.js) via Start-Process ---"
$beStdout = "$backendDir\_smoke_backend.out"
$beStderr = "$backendDir\_smoke_backend.err"
if (Test-Path $beStdout) { Remove-Item $beStdout -Force }
if (Test-Path $beStderr) { Remove-Item $beStderr -Force }
$beEnv = @{ PORT='4001'; HOST='127.0.0.1' }
$beStart = Start-Process -FilePath 'node' `
    -ArgumentList 'src/index.js' `
    -WorkingDirectory $backendDir `
    -RedirectStandardOutput $beStdout `
    -RedirectStandardError $beStderr `
    -WindowStyle Hidden `
    -PassThru
Write-Output "Backend launched PID=$($beStart.Id)"

# ---- Poll branding endpoint (30s) ----
Write-Output "`nPolling /api/public/branding up to 30s..."
$brandOk = $false
$brandDur = 0
while ($brandDur -lt 30000) {
    try {
        $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:4001/api/public/branding' -Method GET -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ([int]$resp.StatusCode -lt 500) { $brandOk = $true; Write-Output "Branding OK HTTP=$($resp.StatusCode) after ${brandDur}ms"; break }
    } catch { }
    Start-Sleep -Milliseconds 600
    $brandDur += 600
}
if (-not $brandOk) { Write-Output "Branding NOT OK after 30s - continue anyway" }

# ---- Start Frontend Vite if not already up ----
Write-Output "`n--- Starting Frontend Vite ---"
$feUp = $false
try {
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ([int]$resp.StatusCode -lt 500) { $feUp = $true; Write-Output "Frontend already UP HTTP=$($resp.StatusCode)" }
} catch {}

$feStart = $null
if (-not $feUp) {
    $feStdout = "$backendDir\_smoke_frontend.out"
    $feStderr = "$backendDir\_smoke_frontend.err"
    if (Test-Path $feStdout) { Remove-Item $feStdout -Force }
    if (Test-Path $feStderr) { Remove-Item $feStderr -Force }
    Write-Output "Launching: npx vite --host 127.0.0.1 --port 5173 --strictPort"
    $feStart = Start-Process -FilePath 'npx' `
        -ArgumentList 'vite','--host','127.0.0.1','--port','5173','--strictPort' `
        -WorkingDirectory $frontendDir `
        -RedirectStandardOutput $feStdout `
        -RedirectStandardError $feStderr `
        -WindowStyle Hidden `
        -PassThru
    Write-Output "Frontend launched PID=$($feStart.Id)"
}

# Write intermediate status to JSON
$interim = @{
    mysql = @{ up = $true; note = 'Port 3306 LISTENING (checked earlier)' }
    backend = @{ up = $brandOk; pid = $beStart.Id; note = if ($brandOk) { 'Branding endpoint < 500 OK' } else { 'Branding endpoint not ready in 30s' } }
    frontend = @{ up = $feUp; pid = if ($feStart) { $feStart.Id } else { $null }; note = if ($feUp) { 'Already UP' } else { 'Launched - pending poll in next step' } }
    calendarSmoke = @{ pass = $false; httpStatus = $null; bodySnippet = ''; errors = @(); note = 'Pending - run smoke_test.js next' }
    startedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$interim | ConvertTo-Json -Depth 5 | Set-Content -Path $statusFile -Encoding UTF8
Write-Output "`nInterim status written to $statusFile"
Write-Output "Backend PID=$($beStart.Id) BrandingOK=$brandOk"
if ($feStart) { Write-Output "Frontend PID=$($feStart.Id)" }
Write-Output "`nDone. Now run: node $backendDir\_smoke_test_only.js"
