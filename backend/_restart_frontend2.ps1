$wd = 'c:\Users\USER\Desktop\DocumentManagementSystem\frontend'
$npx = 'C:\Program Files\nodejs\npx.cmd'
$feOut = "$wd\_vite_restart2.out"
$feErr = "$wd\_vite_restart2.err"

Write-Output "Starting Vite (WindowStyle Hidden)..."
$proc = Start-Process -FilePath $npx `
    -ArgumentList @("vite","--port","5173","--host","127.0.0.1") `
    -WorkingDirectory $wd `
    -WindowStyle Hidden `
    -RedirectStandardOutput $feOut `
    -RedirectStandardError $feErr `
    -PassThru

Write-Output "Vite launched, PID = $($proc.Id)"
Write-Output "Waiting 20 seconds..."
Start-Sleep -Seconds 20

$port5173 = netstat -ano | Select-String ":5173" | Where-Object { $_ -match "LISTENING" }
if ($port5173) {
    Write-Output "Port 5173 LISTENING:"
    $port5173 | ForEach-Object { Write-Output "  $($_.Line.Trim())" }
} else {
    Write-Output "Port 5173 NOT LISTENING"
    if (Test-Path $feOut) {
        Write-Output "--- stdout (tail 20) ---"
        Get-Content $feOut -Tail 20 | ForEach-Object { Write-Output "  $_" }
    }
    if (Test-Path $feErr) {
        Write-Output "--- stderr (tail 20) ---"
        Get-Content $feErr -Tail 20 | ForEach-Object { Write-Output "  $_" }
    }
}
