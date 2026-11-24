$pids = Get-NetTCPConnection -LocalPort 4001 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' } | Select-Object -ExpandProperty OwningProcess
$lines = @()
$lines += "BEFORE Port 4001 PIDs: $($pids -join ',')"
if (-not $pids) {
  $lines += "Port 4001 NOT listening, starting"
  Start-Process -FilePath "node" -ArgumentList "src/app.js" -WorkingDirectory "c:\Users\USER\Desktop\DocumentManagementSystem\backend" -WindowStyle Hidden -RedirectStandardOutput "c:\Users\USER\Desktop\DocumentManagementSystem\backend\be_stdout.log" -RedirectStandardError "c:\Users\USER\Desktop\DocumentManagementSystem\backend\be_stderr.log"
  Start-Sleep -Seconds 10
  $pids2 = Get-NetTCPConnection -LocalPort 4001 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' } | Select-Object -ExpandProperty OwningProcess
  $lines += "AFTER start port 4001 PIDs: $($pids2 -join ',')"
} else {
  $lines += "Port 4001 OK"
}
Set-Content -Path "c:\Users\USER\Desktop\DocumentManagementSystem\backend\ensure_result.txt" -Value $lines
