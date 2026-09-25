$ErrorActionPreference = "Stop"
$statusCode = 0
$location = "NONE"
try {
    $req = [System.Net.HttpWebRequest]::Create("http://localhost:5173/")
    $req.AllowAutoRedirect = $false
    $req.Timeout = 15000
    $resp = $req.GetResponse()
    $statusCode = [int]$resp.StatusCode
    $location = $resp.Headers["Location"]
    if (-not $location) { $location = "NONE" }
    $resp.Close()
} catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        $location = $_.Exception.Response.Headers["Location"]
        if (-not $location) { $location = "NONE" }
    } else {
        $statusCode = 0
        $location = "ERR: $($_.Exception.Message)"
    }
} catch {
    $statusCode = 0
    $location = "ERR: $($_.Exception.Message)"
}
Write-Output "STATUS_CODE=$statusCode"
Write-Output "LOCATION=$location"
