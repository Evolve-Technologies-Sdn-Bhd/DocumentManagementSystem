$wd = 'c:\Users\USER\Desktop\DocumentManagementSystem\backend'
$node = 'C:\Program Files\nodejs\node.exe'
$beOut = "$wd\_backend_restart2.out"
$beErr = "$wd\_backend_restart2.err"

Write-Output "Starting backend node process (detached, WindowStyle Hidden)..."
$proc = Start-Process -FilePath $node `
    -ArgumentList "src/index.js" `
    -WorkingDirectory $wd `
    -WindowStyle Hidden `
    -RedirectStandardOutput $beOut `
    -RedirectStandardError $beErr `
    -PassThru

Write-Output "Backend started, PID = $($proc.Id)"
Write-Output "Waiting 15 seconds..."
Start-Sleep -Seconds 15

$alive = -not $proc.HasExited
Write-Output "Backend alive: $alive"

$port4001 = netstat -ano | Select-String ":4001" | Where-Object { $_ -match "LISTENING" }
if ($port4001) {
    Write-Output "Port 4001 LISTENING:"
    $port4001 | ForEach-Object { Write-Output "  $($_.Line.Trim())" }
} else {
    Write-Output "Port 4001 NOT LISTENING"
    if (Test-Path $beErr) {
        Write-Output "--- stderr ---"
        Get-Content $beErr -Tail 20 | ForEach-Object { Write-Output "  $_" }
    }
    if (Test-Path $beOut) {
        Write-Output "--- stdout ---"
        Get-Content $beOut -Tail 20 | ForEach-Object { Write-Output "  $_" }
    }
}
