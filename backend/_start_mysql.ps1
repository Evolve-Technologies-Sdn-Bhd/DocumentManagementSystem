$wd = 'c:\Users\USER\Desktop\DocumentManagementSystem'
$dataDir = "$wd\backend\mysql-local-data"
$tmpDir = "$wd\backend\mysql-local-tmp"
$ariaLogDir = "$wd\backend\mysql-local-aria-log-fresh"
$mysqlBin = 'C:\xampp\mysql\bin\mysqld.exe'
$errLog = "$wd\backend\_mysqld_restart.err"
$outLog = "$wd\backend\_mysqld_restart.out"

Get-Process -Name mysqld -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Output "Killed existing mysqld"

if (Test-Path "$dataDir\Tech11.pid") {
    Remove-Item "$dataDir\Tech11.pid" -Force -ErrorAction SilentlyContinue
    Write-Output "Removed stale PID file"
}

Write-Output "Starting MySQL with aria-log-dir..."
Start-Process -FilePath $mysqlBin `
    -ArgumentList "--datadir=$dataDir",
                  "--tmpdir=$tmpDir",
                  "--port=3306",
                  "--bind-address=127.0.0.1",
                  "--aria-log-dir=$ariaLogDir" `
    -RedirectStandardError $errLog `
    -RedirectStandardOutput $outLog `
    -WindowStyle Hidden

Write-Output "MySQL start issued. Waiting 8s..."
Start-Sleep -Seconds 8

$portCheck = netstat -ano | Select-String ":3306" | Select-String "LISTENING"
if ($portCheck) {
    Write-Output "Port 3306 LISTENING:"
    $portCheck | ForEach-Object { Write-Output "  $($_.Line.Trim())" }
} else {
    Write-Output "Port 3306 NOT LISTENING"
    if (Test-Path $errLog) {
        Write-Output "--- mysqld err log (last 20 lines) ---"
        Get-Content $errLog -Tail 20 | ForEach-Object { Write-Output "  $_" }
    }
}
