$ErrorActionPreference = "Continue"
$Log = "c:\Users\USER\Desktop\DocumentManagementSystem\_step_report.log"
function L($t) { Add-Content -Path $Log -Value ("[{0}] {1}" -f (Get-Date -Format s), $t); Write-Host $t }
Clear-Content -Path $Log -ErrorAction SilentlyContinue; New-Item -ItemType File -Path $Log -Force | Out-Null

L "===== STEP 0: KILL ALL mysqld / node ====="
$k = @()
Get-Process mysqld -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue; $k += "mysqld:$($_.Id)" }
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue; $k += "node:$($_.Id)" }
Start-Sleep -Seconds 4
L "Killed: $($k -join ', ') (count=$($k.Count))"

$portMap = @{3306=@();4001=@();5173=@()}
try {
  $ns = netstat -ano
  foreach ($line in $ns) {
    foreach ($p in 3306,4001,5173) {
      if ($line -match ":$p\s+.*LISTEN" -and $line -match '\s+(\d+)\s*$') {
        $portMap[$p] += $Matches[1]
      }
    }
  }
} catch {}
$allPorts = ($portMap.Values | ForEach-Object { $_ } | Select-Object -Unique)
L "Port PIDs: 3306=$($portMap[3306] -join ',') 4001=$($portMap[4001] -join ',') 5173=$($portMap[5173] -join ',')"
foreach ($pid in $allPorts) { try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue; L "Killed port PID $pid" } catch {} }
Start-Sleep -Seconds 2

$MYSQL_DATA = "c:\Users\USER\Desktop\DocumentManagementSystem\backend\mysql-local-data"
$pids = Get-ChildItem -Path $MYSQL_DATA -Filter "*.pid" -ErrorAction SilentlyContinue
foreach ($pf in $pids) { try { Remove-Item $pf.FullName -Force -ErrorAction SilentlyContinue; L "Deleted PID file $($pf.Name)" } catch {} }
L "DONE step0"
