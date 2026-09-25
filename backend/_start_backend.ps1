$wd = 'c:\Users\USER\Desktop\DocumentManagementSystem\backend'
Set-Location $wd

$npx = "C:\Program Files\nodejs\npx.cmd"
$node = "C:\Program Files\nodejs\node.exe"
$beOut = "$wd\_backend_restart.out"
$beErr = "$wd\_backend_restart.err"

Write-Output "Running: npx prisma generate"
& $npx prisma generate
Write-Output "prisma generate exit code: $LASTEXITCODE"

Write-Output "Starting backend: node src/index.js"
$proc = Start-Process -FilePath $node `
    -ArgumentList "src/index.js" `
    -WorkingDirectory $wd `
    -RedirectStandardOutput $beOut `
    -RedirectStandardError $beErr `
    -PassThru -NoNewWindow

Write-Output "Backend PID: $($proc.Id)"
Write-Output "Waiting 12 seconds..."
Start-Sleep -Seconds 12

$alive = -not $proc.HasExited
Write-Output "Backend alive: $alive"
if ($proc.HasExited) { Write-Output "Exit code: $($proc.ExitCode)" }

$port4001 = netstat -ano | Select-String ":4001" | Where-Object { $_ -match "LISTENING" }
if ($port4001) {
    Write-Output "Port 4001 LISTENING:"
    $port4001 | ForEach-Object { Write-Output "  $($_.Line.Trim())" }
} else {
    Write-Output "Port 4001 NOT LISTENING"
    if (Test-Path $beErr) {
        Write-Output "--- backend stderr (last 20 lines) ---"
        Get-Content $beErr -Tail 20 | ForEach-Object { Write-Output "  $_" }
    }
    if (Test-Path $beOut) {
        Write-Output "--- backend stdout (last 20 lines) ---"
        Get-Content $beOut -Tail 20 | ForEach-Object { Write-Output "  $_" }
    }
}
