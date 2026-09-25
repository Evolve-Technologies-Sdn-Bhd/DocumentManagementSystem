$ErrorActionPreference = "SilentlyContinue"
$root = "c:\Users\USER\Desktop\DocumentManagementSystem"
$bdir = "$root\backend"
$fdir = "$root\frontend"
$mysqld = "C:\xampp\mysql\bin\mysqld.exe"
$mdata = "$bdir\mysql-local-data"
$mtmp = "$bdir\mysql-local-tmp"
$statusf = "$bdir\_status.log"

Clear-Content -Path $statusf -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $mtmp | Out-Null

Function TStamp { return (Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
Function Add-Status($msg) { Add-Content -Path $statusf -Value ("[" + (TStamp) + "] $msg") }

Add-Status "=== STARTUP SEQUENCE ==="

# Kill old processes
Get-Process -Name mysqld,node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Add-Status "Old processes cleaned"

# 1) MySQL
if (Test-Path $mysqld) {
    Start-Process -FilePath $mysqld -ArgumentList "--datadir=$mdata","--tmpdir=$mtmp","--port=3306","--bind-address=127.0.0.1","--log-error=$bdir\_mysqld_fresh.err" -WindowStyle Hidden
    Add-Status "MySQL started"
} else {
    Add-Status "ERROR mysqld not found at $mysqld"
}

# Wait MySQL
for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $con = netstat -ano | Select-String ":3306.*LISTENING"
    if ($con) { Add-Status "MySQL :3306 LISTENING after $($i+1)s"; break }
}
if (-not $con) { Add-Status "WARN MySQL not listening after 20s" }

# 2) Backend Node :4001
$env:PORT = "4001"
Start-Process -FilePath "node.exe" -ArgumentList "src/index.js" -WorkingDirectory $bdir -RedirectStandardOutput "$bdir\_backend_stdout_fresh.log" -RedirectStandardError "$bdir\_backend_stderr_fresh.err" -WindowStyle Hidden
Add-Status "Backend started"

for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:4001/api/public/branding" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -lt 500) { Add-Status "Backend :4001 OK status=$($r.StatusCode) after $($i+1)s"; break }
    } catch {}
}

# 3) Frontend Vite :5173
Start-Process -FilePath "npx.cmd" -ArgumentList "vite","--host","127.0.0.1","--port","5173" -WorkingDirectory $fdir -RedirectStandardOutput "$bdir\_frontend_stdout_fresh.log" -RedirectStandardError "$bdir\_frontend_stderr_fresh.err" -WindowStyle Hidden
Add-Status "Frontend started"

for ($i=0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:5173/" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -lt 500) { Add-Status "Frontend :5173 OK status=$($r.StatusCode) after $($i+1)s"; break }
    } catch {}
}

Add-Status "=== STARTUP DONE ==="
Get-Process -Name mysqld,node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime | Out-File -Append -FilePath $statusf
