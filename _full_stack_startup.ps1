$ErrorActionPreference = "Continue"

$ROOT       = "c:\Users\USER\Desktop\DocumentManagementSystem"
$BACKEND    = "$ROOT\backend"
$FRONTEND   = "$ROOT\frontend"
$MYSQL_DATA = "$BACKEND\mysql-local-data"
$MYSQL_TMP  = "$BACKEND\mysql-local-tmp"
$MYSQLD     = "C:\xampp\mysql\bin\mysqld.exe"
$ARIA_SRC   = "C:\xampp\mysql\data\aria_log.00000001"
$ARIA_DST   = "$MYSQL_DATA\aria_log.00000001"

$MYSQL_ERR = "$BACKEND\_mysqld_master.err"
$BE_OUT    = "$BACKEND\_backend_master.out"
$BE_ERR    = "$BACKEND\_backend_master.err"
$FE_OUT    = "$FRONTEND\_vite_master.out"
$FE_ERR    = "$FRONTEND\_vite_master.err"
$LOG       = "$ROOT\_full_report.log"
$CAL_JSON  = "$ROOT\_cal_smoke.json"
$FINAL     = "$ROOT\_FINAL_STATUS.txt"

$PIDS = @{}

function L([string]$t) {
    $line = "[{0}] {1}" -f (Get-Date -Format s), $t
    Add-Content -Path $LOG -Value $line
    Write-Host $line
}

function Tail($file, $n=10) {
    if (-not (Test-Path $file)) { return @("(missing $file)") }
    $c = Get-Content -Path $file -ErrorAction SilentlyContinue
    if (-not $c -or $c.Count -eq 0) { return @("(empty $file)") }
    if ($c.Count -le $n) { return $c }
    return $c[-$n..-1]
}

function Test-Port($port) {
    try {
        $ns = netstat -ano 2>$null
        foreach ($ln in $ns) {
            if ($ln -match ":$port\s+.*LISTEN") { return $true }
        }
    } catch {}
    return $false
}

function Get-PortPids($port) {
    $pids = @()
    try {
        $ns = netstat -ano 2>$null
        foreach ($ln in $ns) {
            if ($ln -match ":$port\s+.*LISTEN" -and $ln -match '\s+(\d+)\s*$') {
                $pids += [int]$Matches[1]
            }
        }
    } catch {}
    return ($pids | Select-Object -Unique)
}

function Do-Http($url, $method="GET", $body=$null, $headers=@{}, $timeout=15000) {
    $result = @{ status=0; body=""; error=$null }
    try {
        $req = [System.Net.HttpWebRequest]::Create($url)
        $req.Method = $method
        $req.Timeout = $timeout
        $req.ReadWriteTimeout = $timeout
        $req.ContentType = "application/json"
        foreach ($k in $headers.Keys) {
            if ($k -eq "Authorization") { $req.Headers.Add("Authorization", $headers[$k]) }
            else { try { $req.Headers.Add($k, $headers[$k]) } catch {} }
        }
        if ($body) {
            $bbytes = [System.Text.Encoding]::UTF8.GetBytes($body)
            $req.ContentLength = $bbytes.Length
            $s = $req.GetRequestStream()
            $s.Write($bbytes, 0, $bbytes.Length)
            $s.Close()
        }
        try {
            $resp = $req.GetResponse()
            $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $result.body = $sr.ReadToEnd()
            $result.status = [int]$resp.StatusCode
            $sr.Close(); $resp.Close()
        } catch [System.Net.WebException] {
            $we = $_.Exception
            if ($we.Response) {
                $result.status = [int]$we.Response.StatusCode
                try {
                    $sr = New-Object System.IO.StreamReader($we.Response.GetResponseStream())
                    $result.body = $sr.ReadToEnd()
                    $sr.Close()
                } catch {}
            }
            $result.error = $we.Message
        }
    } catch {
        $result.error = $_.Exception.Message
    }
    return $result
}

function Wait-Port($port, $secs=60, $intervalMs=2500) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $secs) {
        if (Test-Port $port) { return @{ ok=$true; elapsed=$sw.Elapsed.TotalSeconds } }
        Start-Sleep -Milliseconds $intervalMs
    }
    return @{ ok=$false; elapsed=$sw.Elapsed.TotalSeconds }
}

function Wait-HttpOk($url, $secs=30, $intervalMs=2000) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $last = $null
    while ($sw.Elapsed.TotalSeconds -lt $secs) {
        $r = Do-Http $url "GET" $null @{} 5000
        $last = $r
        if ($r.status -ge 100 -and $r.status -lt 500) { return @{ ok=$true; elapsed=$sw.Elapsed.TotalSeconds; last=$r } }
        Start-Sleep -Milliseconds $intervalMs
    }
    return @{ ok=$false; elapsed=$sw.Elapsed.TotalSeconds; last=$last }
}

Remove-Item -Path $LOG,$CAL_JSON,$FINAL -Force -ErrorAction SilentlyContinue
New-Item -ItemType File -Path $LOG -Force | Out-Null

L "============================================================"
L "  FULL STACK STARTUP & SMOKE TEST  (PowerShell 5)"
L "============================================================"
L "ROOT = $ROOT"

# ========================================================
# STEP 0 - KILL OLD PROCESSES
# ========================================================
L ""
L "--- STEP 0: KILL mysqld / node ---"
$killed = @()
Get-Process mysqld -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction Stop; $killed += "mysqld:$($_.Id)" } catch {}
}
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction Stop; $killed += "node:$($_.Id)" } catch {}
}
Start-Sleep -Seconds 3
$portKills = @()
foreach ($p in 3306,4001,5173) {
    $pps = Get-PortPids $p
    foreach ($pid in $pps) {
        try { Stop-Process -Id $pid -Force -ErrorAction Stop; $portKills += "port${p}:$pid" } catch {}
    }
}
Start-Sleep -Seconds 2
Get-ChildItem -Path $MYSQL_DATA -Filter "*.pid" -ErrorAction SilentlyContinue | ForEach-Object {
    try { Remove-Item $_.FullName -Force -ErrorAction Stop; L "  Delete stale PID file: $($_.Name)" } catch {}
}
L "  Killed by name: $($killed -join ', ')"
L "  Killed by port: $($portKills -join ', ')"

# ========================================================
# STEP 1 - PREPARE & START MYSQL
# ========================================================
L ""
L "--- STEP 1: START MariaDB (port 3306) ---"
if (-not (Test-Path $MYSQL_TMP)) {
    New-Item -ItemType Directory -Path $MYSQL_TMP -Force | Out-Null
    L "  Created tmpdir: $MYSQL_TMP"
} else {
    L "  tmpdir exists: $MYSQL_TMP"
}
if (-not (Test-Path $MYSQL_DATA)) {
    L "  ERROR: datadir MISSING at $MYSQL_DATA"
} else {
    L "  datadir exists: $MYSQL_DATA (items=$( (Get-ChildItem $MYSQL_DATA | Measure-Object).Count ))"
    if ((Test-Path $ARIA_SRC) -and -not (Test-Path $ARIA_DST)) {
        try { Copy-Item -Path $ARIA_SRC -Destination $ARIA_DST -Force -ErrorAction Stop; L "  Copied aria_log.00000001" }
        catch { L "  Copy aria ERROR: $($_.Exception.Message)" }
    } else {
        L "  aria_log check: src=$(Test-Path $ARIA_SRC) dst=$(Test-Path $ARIA_DST)"
    }
}

Remove-Item -Path $MYSQL_ERR -Force -ErrorAction SilentlyContinue
$mysqlArgs = @(
    "--datadir=$MYSQL_DATA",
    "--tmpdir=$MYSQL_TMP",
    "--port=3306",
    "--bind-address=127.0.0.1"
)
$mp = Start-Process -FilePath $MYSQLD -ArgumentList $mysqlArgs `
    -RedirectStandardError $MYSQL_ERR -PassThru -NoNewWindow
$PIDS.MYSQL = $mp.Id
L "  mysqld launched PID=$($mp.Id)"
L "  Waiting for port 3306 (max 60s)..."
$wr = Wait-Port 3306 60 2500
$mysqlUp = $wr.ok -and (-not $mp.HasExited)
L "  Port 3306: listen=$($wr.ok) after $($wr.elapsed.ToString('F1'))s, ProcessAlive=$(-not $mp.HasExited)"
if (-not $mysqlUp) {
    if ($mp.HasExited) { L "  mysqld EXITED code=$($mp.ExitCode)" }
    L "  MySQL stderr tail:"
    Tail $MYSQL_ERR 20 | ForEach-Object { L "    ERR: $_" }
}

# ========================================================
# STEP 2 - KILL OLD 4001 & START BACKEND
# ========================================================
L ""
L "--- STEP 2: START Backend (port 4001) ---"
$old4001 = Get-PortPids 4001
if ($old4001.Count -gt 0) {
    L "  Old listeners on 4001: $($old4001 -join ','), killing..."
    foreach ($pp in $old4001) { try { Stop-Process -Id $pp -Force -ErrorAction Stop } catch {} }
    Start-Sleep -Seconds 2
}

Remove-Item -Path $BE_OUT,$BE_ERR -Force -ErrorAction SilentlyContinue
$bp = Start-Process -FilePath "node" -ArgumentList "src/index.js" `
    -WorkingDirectory $BACKEND `
    -RedirectStandardOutput $BE_OUT -RedirectStandardError $BE_ERR `
    -PassThru -NoNewWindow
$PIDS.BACKEND = $bp.Id
L "  backend launched PID=$($bp.Id)"
L "  Polling GET http://127.0.0.1:4001/api/public/branding until <500 (max 30s)..."
$bw = Wait-HttpOk "http://127.0.0.1:4001/api/public/branding" 30 2000
$backendUp = $bw.ok -and (-not $bp.HasExited)
$lastB = if ($bw.last) { $bw.last.status } else { 0 }
L "  Branding poll: ok=$($bw.ok) after $($bw.elapsed.ToString('F1'))s, lastHTTP=$lastB, ProcessAlive=$(-not $bp.HasExited)"
if (-not $backendUp) {
    if ($bp.HasExited) { L "  backend EXITED code=$($bp.ExitCode)" }
    L "  Backend stdout tail:"; Tail $BE_OUT 15 | ForEach-Object { L "    OUT: $_" }
    L "  Backend stderr tail:"; Tail $BE_ERR 15 | ForEach-Object { L "    ERR: $_" }
}

# ========================================================
# STEP 3 - CALENDAR SMOKE TEST
# ========================================================
L ""
L "--- STEP 3: Calendar API smoke test ---"
$calResult = @{ loginStatus=0; calStatus=0; calBody400=""; prismaDateTimeError=$false; status="SKIP" }

if ($backendUp) {
    L "  POST /api/auth/login (admin@company.com / Admin@123)..."
    $loginBody = '{"email":"admin@company.com","password":"Admin@123"}'
    $login = Do-Http "http://127.0.0.1:4001/api/auth/login" "POST" $loginBody @{} 20000
    $calResult.loginStatus = $login.status
    L "  Login: HTTP $($login.status)"
    $token = $null
    if ($login.status -ge 200 -and $login.status -lt 300) {
        try {
            $j = $login.body | ConvertFrom-Json -ErrorAction SilentlyContinue
            $candidates = @($j.token, $j.jwt, $j.accessToken)
            if ($j.data) { $candidates += @($j.data.token, $j.data.jwt, $j.data.accessToken) }
            if ($j.body -and $j.body.PSObject.Properties) { $candidates += @($j.body.token, $j.body.jwt) }
            foreach ($c in $candidates) { if ($c -and [string]$c -match '^[A-Za-z0-9_\-\.]') { $token = [string]$c; break } }
        } catch { L "  Login JSON parse err: $($_.Exception.Message)" }
    }
    L "  Token found: $($token -ne $null) (len=$($token.Length))"

    $hdrs = @{}
    if ($token) { $hdrs["Authorization"] = "Bearer $token" }
    L "  GET /api/calendar?from=2026-09-01&to=2026-09-30 ..."
    $cal = Do-Http "http://127.0.0.1:4001/api/calendar?from=2026-09-01&to=2026-09-30" "GET" $null $hdrs 25000
    $calResult.calStatus = $cal.status
    $fullBody = $cal.body
    if ($fullBody -and $fullBody.Length -gt 400) {
        $calResult.calBody400 = $fullBody.Substring(0, 400)
    } else {
        $calResult.calBody400 = $fullBody
    }
    if ($fullBody -match '(?i)not:\s*DateTime|P2023|DateTime\s*expected|Invalid.*DateTime') {
        $calResult.prismaDateTimeError = $true
    }
    L "  Calendar: HTTP $($cal.status)"
    L "  Prisma 'not: DateTime' error found: $($calResult.prismaDateTimeError)"
    L "  Body first 400 chars:"
    if ($calResult.calBody400) {
        $calResult.calBody400 -split "`r?`n" | ForEach-Object { L "    BODY: $_" }
    }
    $calResult.status = if (($cal.status -ge 200 -and $cal.status -lt 500) -and -not $calResult.prismaDateTimeError) { "PASS" } else { "FAIL" }
    L "  Calendar smoke: $($calResult.status)"
} else {
    L "  SKIP (backend not up)"
}
try {
    $calResult | ConvertTo-Json -Depth 5 -Compress | Set-Content -Path $CAL_JSON -Encoding UTF8
} catch {}

# ========================================================
# STEP 4 - START FRONTEND IF NEEDED
# ========================================================
L ""
L "--- STEP 4: START Frontend (port 5173) ---"
$fePre = Test-Port 5173
if ($fePre) {
    L "  Port 5173 already LISTENING - no need to start Vite"
    $frontendUp = $true
    $PIDS.FRONTEND = $null
} else {
    Remove-Item -Path $FE_OUT,$FE_ERR -Force -ErrorAction SilentlyContinue
    $fp = Start-Process -FilePath "npx.cmd" -ArgumentList @("vite","--host","127.0.0.1","--port","5173") `
        -WorkingDirectory $FRONTEND `
        -RedirectStandardOutput $FE_OUT -RedirectStandardError $FE_ERR `
        -PassThru -NoNewWindow
    $PIDS.FRONTEND = $fp.Id
    L "  vite launched PID=$($fp.Id)"
    L "  Polling GET http://127.0.0.1:5173/ until <500 (max 60s)..."
    $fw = Wait-HttpOk "http://127.0.0.1:5173/" 60 3000
    $frontendUp = $fw.ok -and (-not $fp.HasExited)
    $lastF = if ($fw.last) { $fw.last.status } else { 0 }
    L "  Frontend poll: ok=$($fw.ok) after $($fw.elapsed.ToString('F1'))s, lastHTTP=$lastF, ProcessAlive=$(-not $fp.HasExited)"
    if (-not $frontendUp) {
        if ($fp.HasExited) { L "  vite EXITED code=$($fp.ExitCode)" }
        L "  FE stdout tail:"; Tail $FE_OUT 10 | ForEach-Object { L "    OUT: $_" }
        L "  FE stderr tail:"; Tail $FE_ERR 10 | ForEach-Object { L "    ERR: $_" }
    }
}

# ========================================================
# FINAL REPORT
# ========================================================
L ""
L "============================================================"
L "                  FINAL STATUS SUMMARY"
L "============================================================"
$mysqlTxt    = if ($mysqlUp)    { "UP"   } else { "DOWN" }
$backendTxt  = if ($backendUp)  { "UP"   } else { "DOWN" }
$frontendTxt = if ($frontendUp) { "UP"   } else { "DOWN" }
L "MYSQL    = $mysqlTxt    PID=$($PIDS.MYSQL)"
L "BACKEND  = $backendTxt  PID=$($PIDS.BACKEND)"
L "  CALENDAR SMOKE  = $($calResult.status)"
L "    Login HTTP    = $($calResult.loginStatus)"
L "    Calendar HTTP = $($calResult.calStatus)"
L "    Prisma DateTime Error = $($calResult.prismaDateTimeError)"
if ($calResult.calBody400) {
    L "    Cal Body (400 chars):"
    $calResult.calBody400 -split "`r?`n" | ForEach-Object { L "      > $_" }
}
L "FRONTEND = $frontendTxt PID=$($PIDS.FRONTEND)"
L "============================================================"

$finalLines = @()
$finalLines += "MYSQL=$mysqlTxt"
$finalLines += "BACKEND=$backendTxt  CALENDAR=$($calResult.status)"
$finalLines += "  CAL_HTTP=$($calResult.calStatus)  PRISMA_DATE_ERROR=$($calResult.prismaDateTimeError)"
$finalLines += "  CAL_BODY400=$($calResult.calBody400)"
$finalLines += "FRONTEND=$frontendTxt"
$finalLines += "PIDS: MYSQL=$($PIDS.MYSQL) BACKEND=$($PIDS.BACKEND) FRONTEND=$($PIDS.FRONTEND)"
Set-Content -Path $FINAL -Value ($finalLines -join "`r`n") -Encoding UTF8
L "Final status saved to: $FINAL"
L "Full log saved to: $LOG"

exit 0
