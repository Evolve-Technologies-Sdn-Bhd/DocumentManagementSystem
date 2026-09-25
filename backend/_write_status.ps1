$status = @{
    mysqlListening = $false
    backendListening = $false
    frontendListening = $false
    backendBrandingStatusCode = 0
    frontendHomeStatusCode = 0
    mysqlPid = $null
    backendPid = $null
    vitePid = $null
    nodePids = @()
    timestamp = (Get-Date -Format o)
}

# Check ports
$port3306 = netstat -ano | Select-String ":3306" | Where-Object { $_ -match "LISTENING" }
if ($port3306) { $status.mysqlListening = $true }

$port4001 = netstat -ano | Select-String ":4001" | Where-Object { $_ -match "LISTENING" }
if ($port4001) { $status.backendListening = $true }

$port5173 = netstat -ano | Select-String ":5173" | Where-Object { $_ -match "LISTENING" }
if ($port5173) { $status.frontendListening = $true }

# Get PIDs from netstat
if ($port3306 -match "LISTENING\s+(\d+)") { $status.mysqlPid = [int]$Matches[1] }
if ($port4001 -match "LISTENING\s+(\d+)") { $status.backendPid = [int]$Matches[1] }
if ($port5173 -match "LISTENING\s+(\d+)") { $status.vitePid = [int]$Matches[1] }

# All node PIDs
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcs) { $status.nodePids = @($nodeProcs | Select-Object -ExpandProperty Id) }

# Test branding API
try {
    $req = [System.Net.HttpWebRequest]::Create("http://localhost:4001/api/public/branding")
    $req.Timeout = 10000
    $resp = $req.GetResponse()
    $status.backendBrandingStatusCode = [int]$resp.StatusCode
    $resp.Close()
} catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $status.backendBrandingStatusCode = [int]$_.Exception.Response.StatusCode
    }
} catch {}

# Test frontend
try {
    $req = [System.Net.HttpWebRequest]::Create("http://localhost:5173/")
    $req.AllowAutoRedirect = $false
    $req.Timeout = 15000
    $resp = $req.GetResponse()
    $status.frontendHomeStatusCode = [int]$resp.StatusCode
    $resp.Close()
} catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $status.frontendHomeStatusCode = [int]$_.Exception.Response.StatusCode
    }
} catch {}

# Write JSON
$jsonPath = "c:\Users\USER\Desktop\DocumentManagementSystem\backend\_restart_status.json"
$status | ConvertTo-Json -Depth 5 | Set-Content $jsonPath -Encoding UTF8
Write-Output "Status written to $jsonPath"
Write-Output ""
Write-Output "=== STATUS SUMMARY ==="
Write-Output "mysqlListening:            $($status.mysqlListening)"
Write-Output "backendListening:          $($status.backendListening)"
Write-Output "frontendListening:         $($status.frontendListening)"
Write-Output "backendBrandingStatusCode: $($status.backendBrandingStatusCode)"
Write-Output "frontendHomeStatusCode:    $($status.frontendHomeStatusCode)"
Write-Output "mysqlPid:                  $($status.mysqlPid)"
Write-Output "backendPid:                $($status.backendPid)"
Write-Output "vitePid:                   $($status.vitePid)"
Write-Output "nodePids (all):            $($status.nodePids -join ', ')"
Write-Output "timestamp:                 $($status.timestamp)"
