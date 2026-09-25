$out = 'c:\Users\USER\Desktop\DocumentManagementSystem\backend\_proc_check.txt'
$s = ''
$s += "NODE PROCESSES:`r`n"
$nodes = Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, WS, StartTime
$s += ($nodes | Out-String)
$s += "`r`nMYSQL PROCESS:`r`n"
$ms = Get-Process -Name mysqld -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, WS, StartTime
$s += ($ms | Out-String)
$s += "`r`n--- PORTS LISTENING ---`r`n"
$ports = netstat -ano | Select-String "LISTENING" | Select-String ":3306|:4001|:5173"
$s += ($ports | Out-String)
Set-Content -Path $out -Value $s
Write-Output "Done. Node count=$($nodes.Count)"
