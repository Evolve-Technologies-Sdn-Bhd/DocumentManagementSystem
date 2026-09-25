$wd = 'c:\Users\USER\Desktop\DocumentManagementSystem'
$dataDir = "$wd\backend\mysql-local-data"
$tmpDir = "$wd\backend\mysql-local-tmp"
$ariaLogDir = "$wd\backend\mysql-local-aria-log-fresh"

Write-Output "=== Start MySQL with fresh Aria log dir ==="

if (-not (Test-Path $ariaLogDir)) {
    New-Item -ItemType Directory -Path $ariaLogDir -Force | Out-Null
    Write-Output "Created fresh Aria log dir: $ariaLogDir"
} else {
    Write-Output "Fresh Aria log dir exists"
}

Get-Process -Name mysqld -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Output "Killed existing mysqld"

if (Test-Path "$dataDir\Tech11.pid") {
    Remove-Item "$dataDir\Tech11.pid" -Force
    Write-Output "Removed stale PID file"
}

$mysqlBin = 'C:\xampp\mysql\bin\mysqld.exe'
Write-Output "Starting MySQL with fresh Aria log dir..."
Start-Process -FilePath $mysqlBin `
    -ArgumentList "--datadir=$dataDir",
                  "--tmpdir=$tmpDir",
                  "--port=3306",
                  "--bind-address=127.0.0.1",
                  "--aria-log-dir=$ariaLogDir" `
    -WorkingDirectory $wd `
    -WindowStyle Hidden

Write-Output "MySQL start issued. Waiting 15s..."
Start-Sleep -Seconds 15

$outfile = "$wd\backend\_status_mysql_final.txt"
$s = ""
$s += "MYSQL PROCESSES:`r`n"
$s += (Get-Process -Name mysqld -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, WS, CPU | Out-String)
$s += "`r`nPORT 3306 LISTENING:`r`n"
$s += (netstat -ano | Select-String "LISTENING" | Select-String ":3306" | Out-String)
Set-Content $outfile $s
Write-Output "Status written to $outfile"
