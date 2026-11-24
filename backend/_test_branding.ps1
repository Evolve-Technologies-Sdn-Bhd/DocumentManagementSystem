try {
    $response = Invoke-WebRequest -Uri "http://localhost:4001/api/public/branding" -Method Get -UseBasicParsing -TimeoutSec 10
    Write-Output "STATUS_CODE: $($response.StatusCode)"
    Write-Output "BODY: $($response.Content)"
} catch {
    if ($_.Exception.Response) {
        Write-Output "STATUS_CODE: $([int]$_.Exception.Response.StatusCode)"
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        Write-Output "BODY: $($reader.ReadToEnd())"
    } else {
        Write-Output "ERROR: $($_.Exception.Message)"
    }
}
