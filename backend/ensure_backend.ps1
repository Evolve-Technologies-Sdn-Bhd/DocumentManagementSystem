$pids = Get-NetTCPConnection -LocalPort 4001 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' } | Select-Object -ExpandProperty OwningProcess
Write-Output "Port 4001 PIDs: $($pids -join ',')"
if (-not $pids) {
  Write-Output "Port 4001 NOT listening"
  # start backend in background
  Write-Output "Starting backend..."
  Start-Process -FilePath "node" -ArgumentList "src/app.js" -WorkingDirectory "c:\Users\USER\Desktop\DocumentManagementSystem\backend" -WindowStyle Hidden -RedirectStandardOutput "c:\Users\USER\Desktop\DocumentManagementSystem\backend\be_stdout.log" -RedirectStandardError "c:\Users\USER\Desktop\DocumentManagementSystem\backend\be_stderr.log"
  Start-Sleep -Seconds 8
  $pids2 = Get-NetTCPConnection -LocalPort 4001 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' } | Select-Object -ExpandProperty OwningProcess
  Write-Output "After start port 4001 PIDs: $($pids2 -join ',')"
}
