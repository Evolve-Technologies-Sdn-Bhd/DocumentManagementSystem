try {
    $response = Invoke-WebRequest -Uri "http://localhost:4001/api/public/branding" -Method Get -UseBasicParsing -TimeoutSec 10
    $statusCode = [int]$response.StatusCode
    $body = $response.Content | ConvertFrom-Json
    $success = $body.success
    Write-Output "STATUS_CODE=$statusCode"
    Write-Output "SUCCESS=$success"
} catch {
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        Write-Output "STATUS_CODE=$statusCode"
    } else {
        Write-Output "STATUS_CODE=0"
        Write-Output "ERROR=$($_.Exception.Message)"
    }
}
