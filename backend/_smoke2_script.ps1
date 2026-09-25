$ErrorActionPreference = "Continue"

# --- Poll branding endpoint ---
$maxAttempts = 15
$brandingOk = $false
for ($i=1; $i -le $maxAttempts; $i++) {
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $r = Invoke-WebRequest -Uri "http://localhost:4001/api/public/branding" -TimeoutSec 5 -UseBasicParsing
        $sw.Stop()
        Write-Host "BRANDING OK: Attempt $i, HTTP $($r.StatusCode) in $($sw.ElapsedMilliseconds)ms"
        $brandingOk = $true
        break
    } catch {
        Write-Host "BRANDING Attempt $i FAIL: $($_.Exception.Message)"
        if ($i -lt $maxAttempts) { Start-Sleep -Seconds 2 }
    }
}

# --- 1) Login ---
$jwt = $null
$loginStatus = 0
try {
    $loginBody = @{ email="admin@company.com"; password="Admin@123" } | ConvertTo-Json
    $loginResp = Invoke-WebRequest -Uri "http://localhost:4001/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 10 -UseBasicParsing
    $loginStatus = $loginResp.StatusCode
    $loginJson = $loginResp.Content | ConvertFrom-Json
    if ($loginJson.data -and $loginJson.data.accessToken) {
        $jwt = $loginJson.data.accessToken
    } elseif ($loginJson.accessToken) {
        $jwt = $loginJson.accessToken
    } elseif ($loginJson.data -and $loginJson.data.token) {
        $jwt = $loginJson.data.token
    } elseif ($loginJson.token) {
        $jwt = $loginJson.token
    }
    Write-Host "LOGIN OK: HTTP $loginStatus, JWT length $($jwt.Length)"
} catch {
    if ($_.Exception.Response) {
        $loginStatus = [int]$_.Exception.Response.StatusCode
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $loginBodyRaw = $reader.ReadToEnd()
        Write-Host "LOGIN FAIL: HTTP $loginStatus, body=$loginBodyRaw"
    } else {
        Write-Host "LOGIN EXCEPTION: $($_.Exception.Message)"
    }
}

# --- 2) GET /api/calendar ---
$calStatus = 0
$calBody = ""
$prismaErrorField = $null
try {
    $headers = @{ }
    if ($jwt) { $headers["Authorization"] = "Bearer $jwt" }
    $calResp = Invoke-WebRequest -Uri "http://localhost:4001/api/calendar?from=2026-09-01&to=2026-09-30" -Headers $headers -TimeoutSec 20 -UseBasicParsing
    $calStatus = $calResp.StatusCode
    $calBody = $calResp.Content
    Write-Host "CAL OK: HTTP $calStatus"
} catch {
    if ($_.Exception.Response) {
        $calStatus = [int]$_.Exception.Response.StatusCode
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $calBody = $reader.ReadToEnd()
        Write-Host "CAL FAIL: HTTP $calStatus"
        # Detect Prisma Unknown field / include error
        if ($calBody -match '(?msi)Unknown field \x60([^\x60]+)\x60.*?for model \x60([^\x60]+)\x60') {
            $offending = $Matches[1]
            $model = $Matches[2]
            $validFields = @()
            if ($calBody -match '(?ms)~~~~~(.*?)$') {
                $validBlock = $Matches[1]
                $validFields = ($validBlock | Select-String -Pattern '\x60([^\x60]+)\x60' -AllMatches | ForEach-Object { $_.Matches | ForEach-Object { $_.Groups[1].Value } })
            }
            $prismaErrorField = [ordered]@{
                model = $model
                offending_field = $offending
                valid_fields_suggestion = $validFields
            }
            Write-Host "PRISMA ERROR DETECTED: model=$model, offending=$offending"
        } elseif ($calBody -match '(?msi)Unknown include.*?\x60([^\x60]+)\x60.*?for model \x60([^\x60]+)\x60') {
            $offending = $Matches[1]
            $model = $Matches[2]
            $validFields = @()
            if ($calBody -match '(?ms)~~~~~(.*?)$') {
                $validBlock = $Matches[1]
                $validFields = ($validBlock | Select-String -Pattern '\x60([^\x60]+)\x60' -AllMatches | ForEach-Object { $_.Matches | ForEach-Object { $_.Groups[1].Value } })
            }
            $prismaErrorField = [ordered]@{
                model = $model
                offending_include = $offending
                valid_fields_suggestion = $validFields
            }
            Write-Host "PRISMA INCLUDE ERROR DETECTED: model=$model, offending include=$offending"
        }
    } else {
        Write-Host "CAL EXCEPTION: $($_.Exception.Message)"
        $calBody = $_.Exception.Message
    }
}

# Truncate cal body to 800 chars
$calBody800 = if ($calBody.Length -gt 800) { $calBody.Substring(0, 800) } else { $calBody }

# --- 3) Frontend :5173 ---
$frontendUp = $false
try {
    $fr = Invoke-WebRequest -Uri "http://localhost:5173" -TimeoutSec 5 -UseBasicParsing
    $frontendUp = ($fr.StatusCode -eq 200 -or $fr.StatusCode -eq 304)
    Write-Host "FRONTEND: HTTP $($fr.StatusCode), up=$frontendUp"
} catch {
    Write-Host "FRONTEND FAIL: $($_.Exception.Message)"
}

# --- Output result JSON ---
$mysqlListening = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $c = $tcp.BeginConnect("127.0.0.1", 3306, $null, $null)
    $ok = $c.AsyncWaitHandle.WaitOne(1000, $false)
    if ($ok -and $tcp.Connected) { $mysqlListening = $true }
    $tcp.Close()
} catch { }

$backendPid = 0
$proc = Get-Process -Id 10104 -ErrorAction SilentlyContinue
if ($proc) { $backendPid = $proc.Id }

$result = [ordered]@{
    mysql = $mysqlListening
    backend_pid = $backendPid
    frontend_up = $frontendUp
    cal_status = $calStatus
    cal_body_800 = $calBody800
    prisma_error_field_if_any = $prismaErrorField
}
$resultJson = $result | ConvertTo-Json -Depth 5
Set-Content -Path "c:\Users\USER\Desktop\DocumentManagementSystem\backend\_smoke2.json" -Value $resultJson -Encoding UTF8
Write-Host ""
Write-Host "RESULT WRITTEN to _smoke2.json"
Write-Host ""
Write-Host "---CALENDAR SMOKE OUTPUT---"
Write-Host "HTTP Status: $calStatus"
Write-Host ""
Write-Host "First 800 chars body:"
Write-Host "======================="
Write-Host $calBody800
Write-Host "======================="
Write-Host ""
if ($prismaErrorField) {
    Write-Host "---PRISMA ERROR---"
    Write-Host "MODEL NAME: $($prismaErrorField.model)"
    if ($prismaErrorField.offending_field) { Write-Host "OFFENDING FIELD: $($prismaErrorField.offending_field)" }
    if ($prismaErrorField.offending_include) { Write-Host "OFFENDING INCLUDE: $($prismaErrorField.offending_include)" }
    Write-Host "SUGGESTED VALID RELATIONS/FIELDS: $($prismaErrorField.valid_fields_suggestion -join ', ')"
} elseif ($calStatus -eq 200) {
    try {
        $j = $calBody | ConvertFrom-Json
        $count = 0
        if ($j.data -is [array]) { $count = $j.data.Count }
        elseif ($j.events -is [array]) { $count = $j.events.Count }
        elseif ($j -is [array]) { $count = $j.Count }
        Write-Host "PASS - count of events returned: $count"
    } catch {
        Write-Host "PASS (unable to count events from body structure)"
    }
}
