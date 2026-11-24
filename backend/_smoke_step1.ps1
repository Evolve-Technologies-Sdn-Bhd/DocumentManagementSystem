$wd = 'c:\Users\USER\Desktop\DocumentManagementSystem'
$dataDir = "$wd\backend\mysql-local-data"
$tmpDir = "$wd\backend\mysql-local-tmp"

Write-Output "=== Step 1: Start MySQL ==="

if (Test-Path "$dataDir\Tech11.pid") {
    $pidFile = Get-Content "$dataDir\Tech11.pid"
    Write-Output "PID in file: $pidFile"
    try {
        $alive = Get-Process -Id ([int]$pidFile) -ErrorAction SilentlyContinue
        if (-not $alive) {
            Write-Output "Stale PID file found - removing"
            Remove-Item "$dataDir\Tech11.pid" -Force
        } else {
            Write-Output "PID $pidFile still alive"
        }
    } catch {
        Write-Output "Stale PID file found - removing"
        Remove-Item "$dataDir\Tech11.pid" -Force
    }
} else {
    Write-Output "No PID file"
}

Start-Sleep -Seconds 1

$mysqlBin = 'C:\xampp\mysql\bin\mysqld.exe'
if (-not (Test-Path $mysqlBin)) {
    Write-Output "ERROR: mysqld binary not found at $mysqlBin"
    exit 1
}

Write-Output "Starting MySQL..."
Start-Process -FilePath $mysqlBin `
    -ArgumentList "--datadir=$dataDir","--tmpdir=$tmpDir","--port=3306","--bind-address=127.0.0.1" `
    -WorkingDirectory $wd `
    -WindowStyle Hidden

Write-Output "MySQL start command issued. Waiting 12s..."
Start-Sleep -Seconds 12

$outfile = "$wd\backend\_status_after_mysql.txt"
$s = ""
$s += "MYSQL PROCESSES:`r`n"
$s += (Get-Process -Name mysqld -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, WS | Out-String)
$s += "`r`nPORT 3306 LISTENING:`r`n"
$s += (netstat -ano | Select-String "LISTENING" | Select-String ":3306" | Out-String)
Set-Content $outfile $s
Write-Output "Status written to $outfile"
