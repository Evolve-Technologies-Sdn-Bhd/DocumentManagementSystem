$ErrorActionPreference = "Continue"
$ROOT = "c:\Users\USER\Desktop\DocumentManagementSystem"
$BACKEND = "$ROOT\backend"
$LOCAL = "$BACKEND\mysql-local-data"
$XAMPP_MYSQL = "C:\xampp\mysql\data\mysql"
$LOCAL_MYSQL = "$LOCAL\mysql"
$LOG = "$ROOT\_fix_mysql.log"

function L($t) {
    $line = "[{0}] {1}" -f (Get-Date -Format s), $t
    Add-Content -Path $LOG -Value $line
    Write-Host $line
}
Remove-Item -Path $LOG -Force -ErrorAction SilentlyContinue
New-Item -ItemType File -Path $LOG -Force | Out-Null

L "===== MySQL Fix Script ====="

# 1) Kill any running mysqld
L "Killing any mysqld..."
Get-Process mysqld -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force; L "  Killed mysqld PID=$($_.Id)" } catch {}
}
Start-Sleep -Seconds 3

# 2) Kill stale .pid in datadir
Get-ChildItem -Path $LOCAL -Filter "*.pid" -ErrorAction SilentlyContinue | ForEach-Object {
    try { Remove-Item $_.FullName -Force; L "  Deleted PID file: $($_.Name)" } catch {}
}

# 3) Delete corrupt aria_log files from LOCAL
L "Deleting corrupted aria_log files from LOCAL datadir..."
$ariaFiles = @("aria_log.00000001", "aria_log.00000002", "aria_log_control",
               "Tech11.err", "mysql_error.log",
               "multi-master.info", "master-*.info", "relay-log-*.info",
               "Tech11-relay-bin-*", "mysql-relay-bin-*", "relay-log-*", "mysqld.dmp")
foreach ($pat in $ariaFiles) {
    Get-ChildItem -Path $LOCAL -Filter $pat -ErrorAction SilentlyContinue | ForEach-Object {
        try { Remove-Item $_.FullName -Force; L "  Deleted: $($_.Name)" } catch { L "  Failed delete $($_.Name): $($_.Exception.Message)" }
    }
}

# 4) Copy fresh aria_log.00000001 from XAMPP
$srcAria = "C:\xampp\mysql\data\aria_log.00000001"
$dstAria = "$LOCAL\aria_log.00000001"
if ((Test-Path $srcAria) -and -not (Test-Path $dstAria)) {
    try { Copy-Item $srcAria $dstAria -Force; L "  Copied fresh aria_log.00000001 from XAMPP" }
    catch { L "  ERROR copy aria: $($_.Exception.Message)" }
} else {
    L "  aria_log copy skipped. srcExists=$(Test-Path $srcAria) dstExists=$(Test-Path $dstAria)"
}

# 5) Copy mysql system database folder from XAMPP if LOCAL missing
if (-not (Test-Path $LOCAL_MYSQL)) {
    L "LOCAL mysql DB MISSING. Copying from XAMPP ($XAMPP_MYSQL -> $LOCAL_MYSQL)..."
    try {
        Copy-Item -Path $XAMPP_MYSQL -Destination $LOCAL_MYSQL -Recurse -Force -ErrorAction Stop
        L "  SUCCESS: mysql system DB copied. Items=$( (Get-ChildItem $LOCAL_MYSQL | Measure-Object).Count )"
    } catch {
        L "  ERROR: mysql DB copy failed: $($_.Exception.Message)"
    }
} else {
    L "LOCAL mysql DB exists (items=$( (Get-ChildItem $LOCAL_MYSQL | Measure-Object).Count ))"
}

# 6) Ensure tmpdir
$tmpdir = "$BACKEND\mysql-local-tmp"
if (-not (Test-Path $tmpdir)) {
    New-Item -ItemType Directory -Path $tmpdir -Force | Out-Null
    L "Created tmpdir: $tmpdir"
}

# 7) Start mysqld
$MYSQLD = "C:\xampp\mysql\bin\mysqld.exe"
$MYSQL_ERR = "$BACKEND\_mysqld_fixed.err"
Remove-Item -Path $MYSQL_ERR -Force -ErrorAction SilentlyContinue

L ""
L "Starting mysqld with correct params..."
$mysqlArgs = @(
    "--datadir=$LOCAL",
    "--tmpdir=$tmpdir",
    "--port=3306",
    "--bind-address=127.0.0.1"
)
$mp = Start-Process -FilePath $MYSQLD -ArgumentList $mysqlArgs `
    -RedirectStandardError $MYSQL_ERR -PassThru -NoNewWindow
$mysqlPid = $mp.Id
L "  mysqld launched PID=$mysqlPid"

# 8) Wait for port 3306
L "Waiting for port 3306 (max 90s)..."
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$portOk = $false
while ($sw.Elapsed.TotalSeconds -lt 90) {
    $ns = netstat -ano 2>$null
    $found = $false
    foreach ($ln in $ns) { if ($ln -match ":3306\s+.*LISTEN") { $found = $true; break } }
    if ($found) { $portOk = $true; break }
    if ($mp.HasExited) {
        L "  mysqld EXITED early! Code=$($mp.ExitCode)"
        break
    }
    Start-Sleep -Milliseconds 2500
}
$secs = $sw.Elapsed.TotalSeconds
L "Port 3306: listen=$portOk after ${secs}s"
if (-not $portOk) {
    L "  MySQL stderr tail (25 lines):"
    if (Test-Path $MYSQL_ERR) {
        $c = Get-Content -Path $MYSQL_ERR -ErrorAction SilentlyContinue
        if ($c) { $c[-25..-1] | ForEach-Object { L "    ERR: $_" } }
    }
    # Fallback: check datadir error log
    $de = "$LOCAL\Tech11.err"
    if (Test-Path $de) {
        L "  Datadir Tech11.err tail:"
        $c2 = Get-Content -Path $de -ErrorAction SilentlyContinue
        if ($c2) { $c2[-20..-1] | ForEach-Object { L "    ERR2: $_" } }
    }
}

$myStat = if ($portOk) { "UP" } else { "DOWN" }
L ""
L "MYSQL_STATUS=$myStat PID=$mysqlPid"
exit 0
