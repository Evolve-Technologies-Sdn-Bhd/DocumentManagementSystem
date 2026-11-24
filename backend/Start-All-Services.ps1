###########################################################
# DMS Full Stack Startup Script (All-In-One)
# Executes all 5 steps + summary report as specified.
###########################################################
$ErrorActionPreference = "Continue"

$BACKEND_DIR  = "c:\Users\USER\Desktop\DocumentManagementSystem\backend"
$FRONTEND_DIR = "c:\Users\USER\Desktop\DocumentManagementSystem\frontend"
$MYSQL_DATA   = "$BACKEND_DIR\mysql-local-data"
$MYSQL_TMP    = "$BACKEND_DIR\mysql-local-tmp"
$MYSQLD_EXE   = "C:\xampp\mysql\bin\mysqld.exe"
$ARIA_SRC     = "C:\xampp\mysql\data\aria_log.00000001"
$ARIA_DST     = "$MYSQL_DATA\aria_log.00000001"

$MYSQL_ERR    = "$BACKEND_DIR\_mysqld_final.err"
$BE_OUT       = "$BACKEND_DIR\_backend_final.out"
$BE_ERR       = "$BACKEND_DIR\_backend_final.err"
$FE_OUT       = "$FRONTEND_DIR\_vite_final.out"
$FE_ERR       = "$FRONTEND_DIR\_vite_final.err"
$REPORT       = "$BACKEND_DIR\_final_report.txt"

$pids = @{}

function Write-Report {
    param([string]$Text)
    Add-Content -Path $REPORT -Value $Text
    Write-Host $Text
}

function Get-Tail {
    param([string]$File, [int]$Lines = 10)
    if (-not (Test-Path $File)) { return @("(file does not exist: $File)") }
    $content = Get-Content -Path $File -ErrorAction SilentlyContinue
    if ($null -eq $content -or $content.Count -eq 0) { return @("(empty file)") }
    if ($content.Count -le $Lines) { return $content }
    return $content[-$Lines..-1]
}

# Clear old logs
Remove-Item -Path $MYSQL_ERR,$BE_OUT,$BE_ERR,$FE_OUT,$FE_ERR,$REPORT -Force -ErrorAction SilentlyContinue
New-Item -ItemType File -Path $REPORT -Force | Out-Null

Write-Report "========== FINAL SUMMARY =========="
Write-Report "Started: $(Get-Date -Format o)"

###########################################################
# Step 1: Clean stale MySQL PID files
###########################################################
Write-Report ""
Write-Report "--- Step 1: Clean stale MySQL PID files ---"
$deletedPids = @()
Get-ChildItem -Path $MYSQL_DATA -Filter "*.pid" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
    $deletedPids += $_.Name
}
if ($deletedPids.Count -gt 0) {
    Write-Report "Deleted PID files: $($deletedPids -join ', ')"
} else {
    Write-Report "Deleted PID files: none (no stale files)"
}

###########################################################
# Step 2: Copy missing aria_log
###########################################################
Write-Report ""
Write-Report "--- Step 2: Copy aria_log.00000001 ---"
$srcExists = Test-Path $ARIA_SRC
$dstBefore = Test-Path $ARIA_DST
Write-Report "Source file exists: $srcExists"
Write-Report "Dest   exists before: $dstBefore"

if (-not (Test-Path $MYSQL_TMP)) {
    New-Item -ItemType Directory -Path $MYSQL_TMP -Force | Out-Null
    Write-Report "Created tmp dir: $MYSQL_TMP"
} else {
    Write-Report "Tmp dir exists: $MYSQL_TMP"
}

$ariaCopied = $false
if ($srcExists -and -not $dstBefore) {
    try {
        Copy-Item -Path $ARIA_SRC -Destination $ARIA_DST -Force
        $ariaCopied = $true
        Write-Report "aria_log.00000001 COPIED successfully"
    } catch {
        Write-Report "Copy ERROR: $($_.Exception.Message)"
    }
} elseif ($dstBefore) {
    Write-Report "aria_log.00000001 already existed at dest (no copy needed)"
} else {
    Write-Report "Source aria_log.00000001 not found at $ARIA_SRC"
}
$dstAfter = Test-Path $ARIA_DST
Write-Report "Dest exists after: $dstAfter"

###########################################################
# Step 3: Start MySQL
###########################################################
Write-Report ""
Write-Report "--- Step 3: Start MySQL (port 3306) ---"

$mysqlArgs = @(
    "--datadir=$MYSQL_DATA",
    "--tmpdir=$MYSQL_TMP",
    "--port=3306",
    "--bind-address=127.0.0.1"
)

$mysqlProc = Start-Process -FilePath $MYSQLD_EXE `
    -ArgumentList $mysqlArgs `
    -RedirectStandardError $MYSQL_ERR `
    -PassThru -NoNewWindow

$pids.MySQL = $mysqlProc.Id
Write-Report "MySQL process launched, PID = $($mysqlProc.Id)"
Write-Report "Stderr -> $MYSQL_ERR"
Write-Report "Waiting 10 seconds for startup..."
Start-Sleep -Seconds 10

$mysqlAlive = -not $mysqlProc.HasExited
Write-Report "MySQL process alive after 10s: $mysqlAlive"
if ($mysqlProc.HasExited) { Write-Report "MySQL exit code: $($mysqlProc.ExitCode)" }

$port3306 = netstat -ano | Select-String ":3306" | Where-Object { $_ -match "LISTENING" }
Write-Report "Port 3306 verification: $(if ($port3306) { 'LISTENING' } else { 'NOT LISTENING' })"
$port3306 | ForEach-Object { Write-Report "  $($_.Line.Trim())" }

###########################################################
# Step 4: Start backend
###########################################################
Write-Report ""
Write-Report "--- Step 4: Start backend (port 4001) ---"

$beProc = Start-Process -FilePath "node" `
    -ArgumentList "src/index.js" `
    -WorkingDirectory $BACKEND_DIR `
    -RedirectStandardOutput $BE_OUT `
    -RedirectStandardError $BE_ERR `
    -PassThru -NoNewWindow

$pids.Backend = $beProc.Id
Write-Report "Backend process launched, PID = $($beProc.Id)"
Write-Report "Stdout -> $BE_OUT"
Write-Report "Stderr -> $BE_ERR"
Write-Report "Waiting 12 seconds for startup..."
Start-Sleep -Seconds 12

$beAlive = -not $beProc.HasExited
Write-Report "Backend process alive after 12s: $beAlive"
if ($beProc.HasExited) { Write-Report "Backend exit code: $($beProc.ExitCode)" }

$port4001 = netstat -ano | Select-String ":4001" | Where-Object { $_ -match "LISTENING" }
Write-Report "Port 4001 verification: $(if ($port4001) { 'LISTENING' } else { 'NOT LISTENING' })"
$port4001 | ForEach-Object { Write-Report "  $($_.Line.Trim())" }

###########################################################
# Step 5: Start frontend
###########################################################
Write-Report ""
Write-Report "--- Step 5: Start frontend (port 5173) ---"

$feProc = Start-Process -FilePath "npx.cmd" `
    -ArgumentList @("vite","--port","5173","--host","127.0.0.1") `
    -WorkingDirectory $FRONTEND_DIR `
    -RedirectStandardOutput $FE_OUT `
    -RedirectStandardError $FE_ERR `
    -PassThru -NoNewWindow

$pids.Frontend = $feProc.Id
Write-Report "Frontend process launched, PID = $($feProc.Id)"
Write-Report "Stdout -> $FE_OUT"
Write-Report "Stderr -> $FE_ERR"
Write-Report "Waiting 15 seconds for startup..."
Start-Sleep -Seconds 15

$feAlive = -not $feProc.HasExited
Write-Report "Frontend process alive after 15s: $feAlive"
if ($feProc.HasExited) { Write-Report "Frontend exit code: $($feProc.ExitCode)" }

$port5173 = netstat -ano | Select-String ":5173" | Where-Object { $_ -match "LISTENING" }
Write-Report "Port 5173 verification: $(if ($port5173) { 'LISTENING' } else { 'NOT LISTENING' })"
$port5173 | ForEach-Object { Write-Report "  $($_.Line.Trim())" }

###########################################################
# Summary: PIDs, logs, port status
###########################################################
Write-Report ""
Write-Report "--- Process IDs ---"
Write-Report "MySQL    PID: $($pids.MySQL)    (alive=$mysqlAlive)"
Write-Report "Backend  PID: $($pids.Backend)  (alive=$beAlive)"
Write-Report "Frontend PID: $($pids.Frontend) (alive=$feAlive)"

Write-Report ""
Write-Report "--- Port Status Summary ---"
Write-Report "Port 3306 (MySQL):    $(if ($port3306) { 'LISTENING' } else { 'NOT LISTENING' })"
Write-Report "Port 4001 (Backend):  $(if ($port4001) { 'LISTENING' } else { 'NOT LISTENING' })"
Write-Report "Port 5173 (Frontend): $(if ($port5173) { 'LISTENING' } else { 'NOT LISTENING' })"

Write-Report ""
Write-Report "--- MySQL stderr (last 10 lines) [$MYSQL_ERR] ---"
Get-Tail $MYSQL_ERR | ForEach-Object { Write-Report "  $_" }

Write-Report ""
Write-Report "--- Backend stdout (last 10 lines) [$BE_OUT] ---"
Get-Tail $BE_OUT | ForEach-Object { Write-Report "  $_" }

Write-Report ""
Write-Report "--- Backend stderr (last 10 lines) [$BE_ERR] ---"
Get-Tail $BE_ERR | ForEach-Object { Write-Report "  $_" }

Write-Report ""
Write-Report "--- Frontend stdout (last 10 lines) [$FE_OUT] ---"
Get-Tail $FE_OUT | ForEach-Object { Write-Report "  $_" }

Write-Report ""
Write-Report "--- Frontend stderr (last 10 lines) [$FE_ERR] ---"
Get-Tail $FE_ERR | ForEach-Object { Write-Report "  $_" }

Write-Report ""
Write-Report "Ended: $(Get-Date -Format o)"
Write-Report "========== END SUMMARY =========="
Write-Report ""
Write-Report "Report saved to: $REPORT"
Write-Host ""
Write-Host "All services launched. Press ENTER to exit this script (services will keep running)."
Read-Host
