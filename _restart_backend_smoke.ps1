$ErrorActionPreference = "Continue"
$ROOT = "c:\Users\USER\Desktop\DocumentManagementSystem"
$BACKEND = "$ROOT\backend"
$FRONTEND = "$ROOT\frontend"
$LOG = "$ROOT\_restart_and_smoke.log"

function L($t) {
    $line = "[{0}] {1}" -f (Get-Date -Format s), $t
    Add-Content -Path $LOG -Value $line
    Write-Host $line
}
Remove-Item -Path $LOG -Force -ErrorAction SilentlyContinue
New-Item -ItemType File -Path $LOG -Force | Out-Null

L "===== Restart Backend + Calendar Smoke Test ====="

# ========= 1) Check MySQL still up =========
L "--- Step A: Verify MySQL on 3306 ---"
$ns = netstat -ano 2>$null
$mysqlOk = $false
$mysqlPid = $null
foreach ($ln in $ns) {
    if ($ln -match ":3306\s+.*LISTEN" -and $ln -match '\s+(\d+)\s*$') {
        $mysqlOk = $true
        $mysqlPid = $Matches[1]
        break
    }
}
L "  MySQL: UP=$mysqlOk PID=$mysqlPid"

# ========= 2) Kill old backend (port 4001 & any node.exe) =========
L "--- Step B: Kill old backend processes ---"
$beKilled = @()
try {
    $ns2 = netstat -ano 2>$null
    foreach ($ln in $ns2) {
        if ($ln -match ":4001\s+.*LISTEN" -and $ln -match '\s+(\d+)\s*$') {
            $pp = [int]$Matches[1]
            try { Stop-Process -Id $pp -Force -ErrorAction Stop; $beKilled += "port4001:$pp" } catch {}
        }
    }
} catch {}
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction Stop; $beKilled += "node:$($_.Id)" } catch {}
}
Start-Sleep -Seconds 3
L "  Killed: $($beKilled -join ', ')"

# ========= 3) Start backend =========
L "--- Step C: Start Backend (PID tracking) ---"
$BE_OUT = "$BACKEND\_backend_after_fix.out"
$BE_ERR = "$BACKEND\_backend_after_fix.err"
Remove-Item -Path $BE_OUT,$BE_ERR -Force -ErrorAction SilentlyContinue
$bp = Start-Process -FilePath "node" -ArgumentList "src/index.js" `
    -WorkingDirectory $BACKEND `
    -RedirectStandardOutput $BE_OUT -RedirectStandardError $BE_ERR `
    -PassThru -NoNewWindow
$bePid = $bp.Id
L "  Backend launched PID=$bePid"

# ========= 4) Poll /api/public/branding for max 30s =========
L "  Polling GET /api/public/branding until HTTP<500 (max 30s)..."
function Do-GET($url, $to=5000) {
    try {
        $req = [System.Net.HttpWebRequest]::Create($url)
        $req.Timeout = $to; $req.ReadWriteTimeout = $to
        $req.Method = "GET"
        try {
            $resp = $req.GetResponse()
            $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $body = $sr.ReadToEnd(); $sr.Close(); $resp.Close()
            return @{ s=[int]$resp.StatusCode; b=$body }
        } catch [System.Net.WebException] {
            $we = $_.Exception
            $st = 0; $body = ""
            if ($we.Response) {
                $st = [int]$we.Response.StatusCode
                try {
                    $sr = New-Object System.IO.StreamReader($we.Response.GetResponseStream())
                    $body = $sr.ReadToEnd(); $sr.Close()
                } catch {}
            }
            return @{ s=$st; b=$body; err=$we.Message }
        }
    } catch { return @{ s=0; b=""; err=$_.Exception.Message } }
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$beOk = $false
$lastStatus = 0
while ($sw.Elapsed.TotalSeconds -lt 30) {
    if ($bp.HasExited) { L "  Backend EXITED early code=$($bp.ExitCode)"; break }
    $r = Do-GET "http://127.0.0.1:4001/api/public/branding" 5000
    $lastStatus = $r.s
    if ($r.s -ge 100 -and $r.s -lt 500) { $beOk = $true; break }
    Start-Sleep -Milliseconds 2000
}
$elapsed = $sw.Elapsed.TotalSeconds
L "  Branding result: UP=$beOk (HTTP $lastStatus after ${elapsed}s)"
if (-not $beOk) {
    if (Test-Path $BE_ERR) {
        L "  Backend stderr tail (15):"
        $c = Get-Content -Path $BE_ERR -ErrorAction SilentlyContinue
        if ($c) { $c[-15..-1] | ForEach-Object { L "    ERR: $_" } }
    }
}

# ========= 5) Calendar smoke test =========
L ""
L "--- Step D: Calendar API smoke test ---"
$calOut = @{ login=0; token=$false; cal=0; prismaErr=$false; body400=""; status="SKIP" }

if ($beOk) {
    function Do-HTTP($url, $method, $body, $headers, $to=20000) {
        try {
            $req = [System.Net.HttpWebRequest]::Create($url)
            $req.Timeout = $to; $req.ReadWriteTimeout = $to
            $req.Method = $method
            $req.ContentType = "application/json"
            foreach ($k in $headers.Keys) {
                if ($k -eq "Authorization") { $req.Headers.Add("Authorization", $headers[$k]) }
            }
            if ($body) {
                $bb = [System.Text.Encoding]::UTF8.GetBytes($body)
                $req.ContentLength = $bb.Length
                $s = $req.GetRequestStream()
                $s.Write($bb, 0, $bb.Length); $s.Close()
            }
            try {
                $resp = $req.GetResponse()
                $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
                $rb = $sr.ReadToEnd(); $sr.Close(); $resp.Close()
                return @{ s=[int]$resp.StatusCode; b=$rb }
            } catch [System.Net.WebException] {
                $we = $_.Exception
                $st = 0; $rb = ""
                if ($we.Response) {
                    $st = [int]$we.Response.StatusCode
                    try {
                        $sr = New-Object System.IO.StreamReader($we.Response.GetResponseStream())
                        $rb = $sr.ReadToEnd(); $sr.Close()
                    } catch {}
                }
                return @{ s=$st; b=$rb; err=$we.Message }
            }
        } catch { return @{ s=0; b=""; err=$_.Exception.Message } }
    }

    L "  5a) POST /api/auth/login admin@company.com / Admin@123 ..."
    $loginBody = '{"email":"admin@company.com","password":"Admin@123"}'
    $lr = Do-HTTP "http://127.0.0.1:4001/api/auth/login" "POST" $loginBody @{} 20000
    $calOut.login = $lr.s
    L "     Login HTTP = $($lr.s)"

    $token = $null
    if ($lr.s -ge 200 -and $lr.s -lt 300) {
        try {
            $j = $lr.b | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($j.PSObject.Properties) {
                $cands = @($j.token, $j.jwt, $j.accessToken)
                if ($j.data) {
                    if ($j.data.PSObject.Properties) { $cands += @($j.data.token, $j.data.jwt, $j.data.accessToken) }
                }
                if ($j.body -and $j.body.PSObject.Properties) { $cands += @($j.body.token, $j.body.jwt) }
                foreach ($c in $cands) {
                    if ($c -and [string]$c -match '^[A-Za-z0-9_\-\.]') { $token = [string]$c; break }
                }
            }
        } catch { L "     Login JSON parse: $($_.Exception.Message)" }
    }
    $calOut.token = ($token -ne $null)
    L "     Token found: $($calOut.token)  (len=$($token.Length))"
    if (-not $token -and $lr.b) {
        $preview = if ($lr.b.Length -gt 300) { $lr.b.Substring(0,300) } else { $lr.b }
        L "     Login body preview: $preview"
    }

    L "  5b) GET /api/calendar?from=2026-09-01&to=2026-09-30"
    $hdrs = @{}
    if ($token) { $hdrs["Authorization"] = "Bearer $token" }
    $cr = Do-HTTP "http://127.0.0.1:4001/api/calendar?from=2026-09-01&to=2026-09-30" "GET" $null $hdrs 25000
    $calOut.cal = $cr.s
    $fullBody = $cr.b
    if ($fullBody.Length -gt 400) { $calOut.body400 = $fullBody.Substring(0,400) } else { $calOut.body400 = $fullBody }
    if ($fullBody -match '(?i)not:\s*DateTime|P2023|DateTime\s*expected|Invalid.*DateTime') {
        $calOut.prismaErr = $true
    }
    L "     Calendar HTTP = $($cr.s)"
    L "     Prisma 'not: DateTime' Error = $($calOut.prismaErr)"
    L "     Body (first 400 chars):"
    if ($calOut.body400) {
        $calOut.body400 -split "`r?`n" | ForEach-Object { L "       > $_" }
    }
    $calHttpOk = ($cr.s -ge 200 -and $cr.s -lt 500)
    $calOut.status = if ($calHttpOk -and -not $calOut.prismaErr) { "PASS" } else { "FAIL" }
    L "     Status = $($calOut.status)"
}

# ========= 6) Check frontend port 5173 =========
L ""
L "--- Step E: Verify Frontend port 5173 ---"
$feOk = $false
$fePid = $null
try {
    $ns3 = netstat -ano 2>$null
    foreach ($ln in $ns3) {
        if ($ln -match ":5173\s+.*LISTEN" -and $ln -match '\s+(\d+)\s*$') {
            $feOk = $true
            $fePid = $Matches[1]
            break
        }
    }
} catch {}
if ($feOk) {
    L "  Frontend: UP on port 5173, PID=$fePid  (already running)"
} else {
    L "  Frontend: DOWN. Launching Vite..."
    $FE_OUT = "$FRONTEND\_vite_after_fix.out"
    $FE_ERR = "$FRONTEND\_vite_after_fix.err"
    Remove-Item -Path $FE_OUT,$FE_ERR -Force -ErrorAction SilentlyContinue
    $fp = Start-Process -FilePath "npx.cmd" -ArgumentList @("vite","--host","127.0.0.1","--port","5173") `
        -WorkingDirectory $FRONTEND `
        -RedirectStandardOutput $FE_OUT -RedirectStandardError $FE_ERR `
        -PassThru -NoNewWindow
    $fePid = $fp.Id
    L "  Vite launched PID=$fePid, polling / (max 60s)..."
    $sw2 = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw2.Elapsed.TotalSeconds -lt 60) {
        if ($fp.HasExited) { L "    Vite EXITED code=$($fp.ExitCode)"; break }
        $fr = Do-GET "http://127.0.0.1:5173/" 5000
        if ($fr.s -ge 100 -and $fr.s -lt 500) { $feOk = $true; break }
        Start-Sleep -Milliseconds 3000
    }
    L "  Frontend after launch: UP=$feOk after $($sw2.Elapsed.TotalSeconds)s"
}

# ========= FINAL STATUS =========
L ""
L "==========================================================="
L "                FINAL STATUS  (AFTER FIX)"
L "==========================================================="
$ms = if ($mysqlOk) { "UP" } else { "DOWN" }
$bs = if ($beOk)    { "UP" } else { "DOWN" }
$fs = if ($feOk)    { "UP" } else { "DOWN" }
L "MYSQL    = $ms    PID=$mysqlPid"
L "BACKEND  = $bs    PID=$bePid"
L "  CALENDAR SMOKE = $($calOut.status)"
L "    Login HTTP    = $($calOut.login)"
L "    Got JWT       = $($calOut.token)"
L "    Calendar HTTP = $($calOut.cal)"
L "    Prisma DateTime Error = $($calOut.prismaErr)"
if ($calOut.body400) {
    L "    Cal Body (first 400 chars):"
    $calOut.body400 -split "`r?`n" | ForEach-Object { L "      $_" }
}
L "FRONTEND = $fs    PID=$fePid"
L "==========================================================="

# Save to final report txt
$report = @()
$report += "MYSQL=$ms PID=$mysqlPid"
$report += "BACKEND=$bs PID=$bePid"
$report += "CALENDAR=$($calOut.status)"
$report += "  LOGIN_HTTP=$($calOut.login)  JWT_OK=$($calOut.token)"
$report += "  CAL_HTTP=$($calOut.cal)  PRISMA_DATE_ERROR=$($calOut.prismaErr)"
$report += "  CAL_BODY400=$($calOut.body400)"
$report += "FRONTEND=$fs PID=$fePid"
Set-Content -Path "$ROOT\_FINAL_AFTER_FIX.txt" -Value ($report -join "`r`n") -Encoding UTF8
L "Report saved to $ROOT\_FINAL_AFTER_FIX.txt"
exit 0
