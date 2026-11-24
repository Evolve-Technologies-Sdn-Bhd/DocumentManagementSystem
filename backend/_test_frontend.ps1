try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173/" -Method Get -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0 -ErrorAction SilentlyContinue
    $statusCode = [int]$response.StatusCode
    Write-Output "STATUS_CODE=$statusCode"
    Write-Output "LOCATION=NONE"
} catch {
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        $loc = $_.Exception.Response.Headers["Location"]
        if (-not $loc) { $loc = "NONE" }
        Write-Output "STATUS_CODE=$statusCode"
        Write-Output "LOCATION=$loc"
    } else {
        Write-Output "STATUS_CODE=0"
        Write-Output "ERROR=$($_.Exception.Message)"
    }
}
