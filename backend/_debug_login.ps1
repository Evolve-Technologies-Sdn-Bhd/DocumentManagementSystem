$loginBody = @{ email="admin@company.com"; password="Admin@123" } | ConvertTo-Json
$loginResp = Invoke-WebRequest -Uri "http://localhost:4001/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 10 -UseBasicParsing
Write-Host "STATUS: $($loginResp.StatusCode)"
Write-Host "CONTENT RAW:"
Write-Host $loginResp.Content
Write-Host "---"
Write-Host "HEADERS:"
$loginResp.Headers | ForEach-Object { $_ }
