$wd = 'c:\Users\USER\Desktop\DocumentManagementSystem\frontend'
Set-Location $wd

$npx = "C:\Program Files\nodejs\npx.cmd"
$feOut = "$wd\_vite_restart.out"
$feErr = "$wd\_vite_restart.err"

Write-Output "Starting frontend: npm run dev (vite)"
$proc = Start-Process -FilePath $npx `
    -ArgumentList @("vite","--port","5173","--host","127.0.0.1") `
    -WorkingDirectory $wd `
    -RedirectStandardOutput $feOut `
    -RedirectStandardError $feErr `
    -PassThru -NoNewWindow

Write-Output "Frontend PID: $($proc.Id)"
Write-Output "Waiting 18 seconds for Vite startup..."
Start-Sleep -Seconds 18

$alive = -not $proc.HasExited
Write-Output "Frontend alive: $alive"
if ($proc.HasExited) { Write-Output "Exit code: $($proc.ExitCode)" }

$port5173 = netstat -ano | Select-String ":5173" | Where-Object { $_ -match "LISTENING" }
if ($port5173) {
    Write-Output "Port 5173 LISTENING:"
    $port5173 | ForEach-Object { Write-Output "  $($_.Line.Trim())" }
} else {
    Write-Output "Port 5173 NOT LISTENING"
    if (Test-Path $feErr) {
        Write-Output "--- vite stderr (last 30 lines) ---"
        Get-Content $feErr -Tail 30 | ForEach-Object { Write-Output "  $_" }
    }
    if (Test-Path $feOut) {
        Write-Output "--- vite stdout (last 30 lines) ---"
        Get-Content $feOut -Tail 30 | ForEach-Object { Write-Output "  $_" }
    }
}
