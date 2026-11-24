$wd = 'c:\Users\USER\Desktop\DocumentManagementSystem'
$dataDir = "$wd\backend\mysql-local-data"
$ariaChk = 'C:\xampp\mysql\bin\aria_chk.exe'

Write-Output "=== Repairing crashed Aria tables ==="

if (-not (Test-Path $ariaChk)) {
    Write-Output "ERROR: aria_chk.exe not found at $ariaChk"
    exit 1
}

Get-Process -Name mysqld -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Write-Output "Killed any existing mysqld processes"

$tablesToRepair = @(
    "$dataDir\mysql\proxies_priv",
    "$dataDir\mysql\db"
)

foreach ($tbl in $tablesToRepair) {
    if (Test-Path "$tbl.MAI") {
        Write-Output "`nRepairing: $tbl"
        & $ariaChk -r -e "$tbl.MAI" 2>&1 | ForEach-Object { Write-Output $_ }
        Write-Output "Exit code: $LASTEXITCODE"
    } else {
        Write-Output "Table file not found: $tbl.MAI"
    }
}

Write-Output "`n=== Repair done ==="
